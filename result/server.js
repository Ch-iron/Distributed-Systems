var express = require('express'),
    async = require('async'),
    pg = require('pg'),
    { Pool } = require('pg'),
    path = require('path'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

io.set('transports', ['polling']);

var port = process.env.PORT || 4000;

var mode = 0;
var condition_time = 0;
var res_time = '';

io.sockets.on('connection', function (socket) {

  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

var pool = new pg.Pool({
  connectionString: 'postgres://postgres:postgres@db/postgres'
});

async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  if (mode === 0) { // normal mode
    client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
      if (err) {
        console.error("Error performing query: " + err);
      } else {
        var votes = collectVotesFromResult(result);
        io.sockets.emit("scores", JSON.stringify(votes));
      }

      setTimeout(function() {getVotes(client) }, 1000);
    });
  } else if (mode === 1) { // period mode
    client.query('SELECT vote, COUNT(id) AS count FROM votes WHERE time >= ' + condition_time + 'GROUP BY vote', [], function(err, result) {
      if (err) {
        console.error("Error performing query: " + err);
      } else {
        var votes = collectVotesFromResult2(result);
        io.sockets.emit("scores_period", JSON.stringify(votes));
      }

      setTimeout(function() {getVotes(client) }, 1000);
    });
  }
}

function collectVotesFromResult(result) {
  var votes = {a: 0, b: 0, c: 0, d: 0};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

function collectVotesFromResult2(result) {
  var votes = {a: 0, b: 0, c: 0, d: 0, time: res_time};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

app.use(cookieParser());
app.use(bodyParser());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
  next();
});

app.use(express.static(__dirname + '/views'));

app.get('/', function (req, res) {
  mode = 0;
  res.sendFile(path.resolve(__dirname + '/views/index.html'));
});

app.get('/period', function (req, res) {
  mode = 1;
  const date = new Date();
  const pres_date = Math.floor(date.getTime()/1000);

  var req_time = Object.keys(req.query)[0];
  const standard = req_time[req_time.length - 1];
  const num = parseInt(req_time.slice(0, -1));
  if (standard === 'm'){
    condition_time = pres_date - num*60;
    res_time = req_time.slice(0, -1) + ' minute';
  } else if (standard === 'h') {
    condition_time = pres_date - num*60*60;
    res_time = req_time.slice(0, -1) + ' hour';
  } else if (standard === 'd') {
    condition_time = pres_date - num*60*60*24;
    res_time = req_time.slice(0, -1) + ' day';
  }
  res.sendFile(path.resolve(__dirname + '/views/index_period.html'));
});


server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
