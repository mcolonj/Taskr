var r = require("rethinkdb");
var express = require('express');
var bodyParser = require("body-parser");
var sockio = require("socket.io");
var fs = require("fs");
var handlebars = require("handlebars");
var db_config = require('./db_config.json');
var promise = require('bluebird');
var r = require('rethinkdb-websocket-server').r;

var connections = [];

// -----------------------------------------------------
// rethinkdb code
// -----------------------------------------------------

// connection object
var conn = promise.promisify(r.connect)({
  host:'localhost',
  port:28015,
  db: 'tasksapp',
});

// run function
function run(q) {
  return conn.then(function(c) {
    return q.run(c);
  });
}

// project table: id, name, description
// task table: id, projectId, description, {geo: lng, lat, lnglats, type:[marker, polygon, polyline]}

// db setup
console.log("checking for tasksapp database");
run(r.dbList().contains('tasksapp').do(function(databaseExists) {
  return r.branch(databaseExists,
  {exists:1},
  r.dbCreate('tasksapp'));
})).then(function(result) {
  if (result.exists == 1) console.log('tasksapp db created');
  else console.log('tasksapp exists');
}).catch(function(err){});

// projects table setup
console.log("checking for projects table.");
run(r.db('tasksapp').tableList().contains('projects').do(function(tableExists) {
  return r.branch(tableExists, {exists:1}, r.db('tasksapp').tableCreate('projects'));
})).then(function(result) {
  if (result.exists == 1) console.log("projects table exists");
  else console.log("projects table created.");
}).catch(function(err){});

// tasks table setup
console.log("checking for tasks table.");
run(r.db('tasksapp').tableList().contains('tasks').do(function(tableExists) {
  return r.branch(tableExists, {exists:1}, r.db('tasksapp').tableCreate('tasks'));
})).then(function(result) {
  if ( result.exists == 1) console.log("tasks table exists");
  else console.log("tasks table created");
}).catch(function(err){});

// media table setup
console.log("checking for media table.");
run(r.db('tasksapp').tableList().contains('media').do(function(tableExists) {
  return r.branch(tableExists, {exists:1}, r.db('tasksapp').tableCreate('media'));
})).then(function(result) {
  if (result.exists == 1) console.log("media table exists");
  else console.log("media table created.");
}).catch(function(err){});
console.log("Done verifying DB.")

// helper functions
var update = function(table, identifier, update, callback) {
  run(r.table(table).get(identifier).update(update)).then(callback).catch(function(err){});
}
var insert = function(table, insert, callback) {
  run(r.table(table).insert(insert)).then(callback).catch(function(err){});
}

// -----------------------------------------------------
// Express api code
// -----------------------------------------------------
var app = express();
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static(__dirname+"/public"));
var io = sockio.listen(app.listen(4300), {log:true});

// db name
var dbname='tasksapp';

// add task api method
app.post('/api/data/add_task', function(req, res) {
  console.log("adding a task");
  project = (req.body.projectId) ? req.body.projectId : '';
  insert('tasks', {
      projectId:project,
      title:req.body.title,
      description:req.body.description,
      creation:r.now(),
      completed:false,
    }, function(result) {
      res.send(result.generated_keys[0]);
    });
});

// update task description api method
app.post('/api/data/update_task_description', function(req, res) {
  update('tasks', req.body.id, {description:req.body.description}, function(result) {
    console.log("updating task for %s, %s", req.body.id, req.body.description);
    res.send(JSON.stringify(result));
  });
});

// update task title api method
app.post('/api/data/update_task_title', function(req, res) {
  update('tasks', req.body.id, {title:req.body.title}, function(result) {
    console.log("updating task for %s, %s", req.body.id, req.body.title);
    res.send(JSON.stringify(result));
  });
});

// attach project id to task (not working yet)
app.post('/api/data/attach_project_id/:project_id/:task_id', function(req,res) {
  run(r.table('tasks').get(task_id).update({
    project:id,
  })).then(function(result) {
    console.log("Attach Project ID: "+result);
  }).catch(function(err){console.log(err);});
});

// delete task api method
app.post('/api/data/delete_task/:id', function(req, res) {
  run(r.table('tasks').get(req.params.id).delete()).then(function(result) {
    res.send(result);
  });
});

// add project api method
app.post('/api/data/add_project', function(req, res) {
  console.log('adding project');
  insert('projects', {title:req.body.title, description:req.body.description }, function(result) {
    console.log("Insert table results: %s", JSON.stringify(result));
    res.send(JSON.stringify(result.generated_keys));
  });
});

// project search api method (not working yet).
app.get('/api/search/projects_matching/:searchTerm', function(req, res) {
  run(r.table('projects')).get({title:req.params.searchTerm}).then(function(cursor) {
    cursor.toArray(function(err, results) {
      res.send(results);
      console.log("Found project %s matching %s: ", results, req.params.searchTerm);
    });
  }).catch(function(err){});
});


// app.get('/api/data/get_active_tasks', function(req, res) {
//   run(r.table('tasks')).then(function(cursor) {
//     cursor.toArray(function(err, results) {
//       res.send(results);
//       console.log("Active Task: "+results);
//     });
//   }).catch(function(err){});
// });

// app.get('/templates/task_form', function(req, res) {
//   var source = fs.readFileSync('templates/taskform.html');
//   var template = handlebars.compile(source.toString());
//   var data = {'task-submission-url':'api/data/add_task', 'task-input-onchange':'none', 'task-button-text':'Add Task'};
//   var result = template(data);
//   res.send(result);
// });

app.get('/api/data/get_task_for_id/:id', function(req, res) {
  console.log("get task id: %s", req.params.id);
  run(r.table('tasks').get(req.params.id)).then(function(cursor) {
    res.send(JSON.stringify(cursor));
  });
});

// -----------------------------------------------------
// socket io implementations. will convert most api methods to
// socket io methods.
// -----------------------------------------------------
io.sockets.on('connection', function(socket){
  connections.push(socket);
  console.log('Connected: %s sockets connected.', connections.length);
  socket.on('disconnect', function(socket) {
      connections.splice(connections.indexOf(socket), 1);
      console.log('Disconnected: %s sockets connected.', connections.length);
  });

  socket.on('add task', function(t) {
    io.sockets.emit('new task', {id:t.id, title:t.title, desc: t.description, creation:t.creation});
  });

  socket.on('refresh', function() {
    var data = [];
    run(r.table('tasks').orderBy(r.desc('creation'))).then(function(cursor) {
      cursor.toArray(function(err, results) {
        io.sockets.emit('refreshed data', JSON.stringify({tasks:results}));
      });
    }).catch(function(err){});
  });
});
