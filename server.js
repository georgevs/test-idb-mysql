const http = require('http');
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

//----------------------------------------------------------------------------------------
const config = () => ({
  server: {
    // key, cert
    port: 8080
  },
  db: {
    host: '172.18.0.201', 
    port: 3306, 
    user: 'root', 
    password: 'LikeBeingThere'
  }
});

//----------------------------------------------------------------------------------------
const db = ({ host, port, user, password }) => {
  const connection = mysql.createConnection({ host, port, user, password });
  connection.connect();
  const query = ({ sql, values }, callback) => connection.query(sql, values, callback);
  return { query };
};

//----------------------------------------------------------------------------------------
const app = (db) => {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  
  const sendAll = (res) => (err, results) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(err ? 500 : 200);
    res.send(JSON.stringify(err || results));
  };

  const sendOne = (res) => (err, results) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(err ? 500 : results.length == 0 ? 404 : 200);
    res.send(JSON.stringify(err || results[0] || {}));
  };

  app.get('/users', (req, res) => {
    db.query({ sql: 'SELECT * FROM test.Users' }, sendAll(res));
  });

  return app;
};

//----------------------------------------------------------------------------------------
const server = ({ port }, app) => {
  const server = http.createServer(app);
  const start = () => {
    server.listen(port, () => { console.log(`Listening on port ${port}`)});
  };
  return { start };
};

//----------------------------------------------------------------------------------------
const serve = (config) => {
  server(config.server, app(db(config.db))).start();
};

serve(config());
