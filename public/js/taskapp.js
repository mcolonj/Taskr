
API_CONFIG = {
  port:4300,
  host:'localhost',
  path:'/api/data/'
};

var task = {
  id:"",
  title:"",
  description:"",
  creation:null,
  init:function(id, title, description,creation) {
   this.id = id;
   this.title = title;
   this.description = description;
   this.creation = creation;
 },
 json:function() {
   return {id:this.id, title:this.title, description:this.description, creation:this.creation};
 }
}

// -----------------------------------------------------
// TaskApp object
// -----------------------------------------------------
var taskapp = {
  api:"http://"+API_CONFIG.host+":"+API_CONFIG.port+API_CONFIG.path,
  tasks:null,
  currentTask:null,
  form:"",
  init:function(){
  },
  bindEvents:function() {
    // this.addTask.on('click', this.onAddTaskClick.bind(this));
  },
  addTask:function(title, description, callback) {
    console.log('adding a task');
    var endpoint = "add_task"
    var data = {'id':'','title':title, 'description':description, 'creation':''};
    $.post(this.api+endpoint, data, callback);
  },
  addProject:function(title, description) {
    console.log('adding a project');
    var endpoint = "add_project"
    var data = {'id':'','title':title, 'description':description};
    $.post(this.api+endpoint, data, function(retval) {
       console.log("retval: "+retval);
       return retval;
    });
  },
  getTasks:function(endpoint) {
    var endpoint = "get_tasks";
    $.getJSON(this.api+api_endpoint, function(data) {
      var list = $("#task-list").html();
      data.forEach(function(item) {
        html = html + "<option value='"+item.id+"'>"+item.title+"</option>";
      });
      $("#task-list").html(html);
    });
  },
  getActiveTasks:function(){
    return this.getTasks('get_active_tasks')
  },
  getCompletedTasks:function(){
    return this.getTasks('get_completed_tasks')
  },
  projectsMatching:function(searchTerm) {
    var endpoint = "projects_matching";
    $.getJSON("/api/search/projects_matching/"+searchTerm , function(data) {
      var list = $("#suggestion-list").html();
      data.forEach(function(item) {
        console.log("Suggested Item: "+item.title);
      });
      $("#task-list").html(html);
    });
  },
}

// -----------------------------------------------------
// Jquery
// -----------------------------------------------------
$(document).ready(function(){
  // declare socket connction
  var socket = io.connect();
  // taskapp object
  taskapp.init();

  // -----------------------------------------------------
  // UI Components (jquery)
  // -----------------------------------------------------
  var $currentTaskId = $('#current-task-id');
  var $title = $("#title");
  var $description = $("#description");
  var $tasklist = $(".task-list");
  var data = ( new Date() ).getTime();
  var $currentProject = $("#current-project");
  var $bigTaskInput = $("#big-task-input");
  var $taskField = $(".task-field");
  var $taskItem = $(".task-item");
  var $deleteTask = $("#delete-task");
  // ui big task maker input
  $bigTaskInput.bind( {
    keydown:function(e) {
      field = $(this);
      console.log(e.keyCode);
      console.log(field.val()+ " : " + field.val().length);
      if (e.keyCode == 13) {
        $description.html('');
        $description.focus();
      }
    },
    blur:function(e) {
      field = $(this);
      if (field.val().length >= 1) {
        $description.val('');
        taskapp.addTask(field.val(), '', function(retval) {
          $title.val(field.val());
          $currentTaskId.val(retval.replace('\"', ''));
          $tasklist.append("<li id='"+$currentTaskId.val()+"' class='task-item' value='"+$currentTaskId.val()+"'>"+
          "<p><b>"+field.val()+"</b>:</p></li>");
          $description.focus();
          $bigTaskInput.val('');
          console.log('task list'+$tasklist.html());
        });
      }
    }
  });
  // title ui binding
  $title.bind({
    blur:function(e) {
      var data = {id:$currentTaskId.val(), title:$title.val()};
      $.post('/api/data/update_task_title/', data, function(result) {
          // $("#"+$currentTaskId.val()).html("<p><b>"+$title.val()+"</b>: "+$description.val()+"</p></li>");
          updateTaskItem($currentTaskId.val(), $title.val(), $description.val());
        });
    },
  });
  // description ui binding
  $description.bind({
    blur:function(e) {
      var data = {id:$currentTaskId.val(), description:$description.val()};
      $.post('/api/data/update_task_description/', data, function(result) {
          // $("#"+$currentTaskId.val()).html("<p><b>"+$title.val()+"</b>: "+$description.val()+"</p></li>");
          updateTaskItem($currentTaskId.val(), $title.val(), $description.val());
        });
    },

  });

  // delete task button click
  $deleteTask.on('click', function(e) {
    $.post('/api/data/delete_task/'+$currentTaskId.val(), function(result) {
      deleteTask($currentTaskId.val());
      clearTaskForm();
    });
  });

  // task-item click.
  $("body").on('click','.task-item',function(e){
      whiteTaskItems()
      field = $(this);
      field.css("background-color", "#7cadff");
      $currentTaskId.val(field.val());
      $title.val('');
      $description.val('');
      $.getJSON('/api/data/get_task_for_id/'+field.attr('value'), function(data) {
          // $currentTaskId.val(data.id);
          // $title.val(data.title);
          // $description.val(data.description);
          setCurrentTask(data.id, data.title, data.description);
        });
    });

  // -----------------------------------------------------
  // Utility functions
  // -----------------------------------------------------

  function clearTaskForm() {
    $title.val("");
    $description.val("");
    $bigTaskInput.val("");
  }

  function whiteTaskItems() {
    $('.task-item').css('background-color', '#fff');
  }

  function setCurrentTask(id, title, description) {
    $currentTaskId.val(id);
    $title.val(title);
    $description.val(description);
  }

  function deleteTask(id) {
    $('#'+id).remove();
  }

  function updateTaskItem(id, title, description) {
    $("#"+id).html("<p><b>"+title+"</b>: "+description+"</p></li>");
  }

  function appendTaskItem(id, title, description) {
    $tasklist.append("<li id='"+id+"' class='task-item' value='"+id+"'>"+
    "<p><b>"+title+"</b>: "+description+"</p></li>");
  }

  // -----------------------------------------------------
  // socket client connection methods
  // -----------------------------------------------------
  socket.emit('refresh');
  socket.on('refreshed data', function(data) {
    $tasklist.html('');
    object = JSON.parse(data);
    $.each(object.tasks, function(index, item) {
      console.log('index: %s, item: %s', index, ""+item.id);
      appendTaskItem(item.id, item.title,item.description);
    });
  });

  socket.on('new task', function(item) {
    console.log('new task was fired in browser');
    appendTaskItem(item.id, item.title,item.description);
  });

  socket.on('connect', function(data) {
    console.log('connected');
  });
});
