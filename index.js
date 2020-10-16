var mqtt = require('mqtt')
var sqlite3 = require('sqlite3').verbose();
const express = require('express')
let mustacheExpress = require('mustache-express');
let bodyParser = require('body-parser');

const tableify = require('tableify')

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
});

let db = new sqlite3.Database('./database.sqlite', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');

    db.all('CREATE TABLE IF NOT EXISTS log (device Text, time Text, input Integer, state Integer, UNIQUE (device, time, input) );')
});

var client = mqtt.connect('mqtt://broker.hivemq.com')

client.on('connect', function () {
    client.subscribe('topic_esp8266_katkotesti/#', function (err) {

    })
})

client.on('message', function (topic, message) {
    // message is Buffer
    let msg = new Date().toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' }) + ' Message : ' + message.toString() + ' Topic: ' + topic + '\n'
    let device = topic.slice(topic.indexOf('/') + 1);
    data = JSON.parse(message.toString())
    data.data.forEach((item) => {
        console.log(`Time:${new Date(item.time * 1000).toISOString()}\tInput:${item.input}\tState:${item.state}`);
        let sql = `INSERT INTO log (device, time, input, state) values ("${device}", ${item.time * 1000}, ${item.input}, ${item.state})`
        db.all(sql, (err, rows) => {

        })
        sql = `INSERT INTO devices (mac, input) VALUES ("${device}", ${item.input})`
        db.all(sql, (err, rows) => {
            sql = `UPDATE devices SET lastMsg="${new Date().getTime()}" WHERE mac="${device}"`
            db.all(sql, (err, rows) => {})
        })
    })
})


//Webserver
const app = express()
const port = 3010

app.engine('mustache', mustacheExpress());
app.engine('htm', mustacheExpress());
app.set('view engine', 'mustache')
app.set('views', `${__dirname}/www`);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())


app.get('/old', (req, res) => {
    db.all("SELECT d.name, l.device, l.time, l.input, l.state FROM log l  LEFT JOIN devices d ON d.mac = l.device and d.input = l.input WHERE l.input > 0 ORDER BY time", (err, rows) => {
        if (err) return 0
        rows = rows.map((row) => {
            row.time = new Date(new Date(Number(row.time))).toLocaleString('FI-fi', { timezone: 'Europe/Helsinki', hour12: false })
            row.device = `<A HREF="/chart/${row.device}/${row.input}">${row.device}</A>`
            return row
        })
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.write('<head><link rel="stylesheet" href="table.css">')
        res.write('<script src="https://code.jquery.com/jquery-1.12.4.min.js" integrity="sha256-ZosEbRLbNQzLpnKIkEdrPv7lOy9C27hHQ+Xp8a4MxAQ=" crossorigin="anonymous"></script>')
        res.write('<script src="jquerystickytableheadersmin.js"></script>')
        res.write('<script>$(function() { $("table").stickyTableHeaders(); });</script>')
        res.write('</head><body>')
        res.write(tableify(rows))
        res.end()
    })
})
app.get("/devices", (req, res) => {
    db.all("SELECT * FROM devices", (err, rows) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.write('<head><link rel="stylesheet" href="table.css">')
        res.write('<script src="https://code.jquery.com/jquery-1.12.4.min.js" integrity="sha256-ZosEbRLbNQzLpnKIkEdrPv7lOy9C27hHQ+Xp8a4MxAQ=" crossorigin="anonymous"></script>')
        res.write('<script src="jquerystickytableheadersmin.js"></script>')
        res.write('<script>$(function() { $("table").stickyTableHeaders(); });</script>')
        res.write('</head><body>')
        res.write(tableify(rows))
        res.end()
    })
})
app.get('/clear', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write('<meta http-equiv="refresh" content="2; url=/" />')
    res.write('Log cleared')
    res.end()
    db.all("DELETE FROM LOG", (err) => { })
    db.all("DELETE FROM devices", (err) => { })
})
/*
app.get('/chart/:MAC/:INPUT', (req, res) => {
    res.render('chart.htm')
}, {mac:req.params.MAC, input:req.params.INPUT})
*/
app.get('/chart/:MAC/:INPUT', (req, res) => {
    res.render('chart.htm', { MAC: req.params.MAC, INPUT: req.params.INPUT })
})

app.get('/data/:MAC/:INPUT', (req, res) => {
    let sql = `SELECT * FROM log WHERE device ="${req.params.MAC}" and input="${req.params.INPUT}"`
    db.all(sql, (err, rows) => {
        rows = rows.reduce((acc, current) => {
            acc.data.push([Number(current.time), current.state])
            return acc
        }, { data: [], name: '' })
        sql = `SELECT * FROM devices WHERE mac="${req.params.MAC}" and input="${req.params.INPUT}"`
        db.all(sql, (err, r) => {
            if (r && r[0].name) rows.name = r[0].name
            res.send(rows)
        })

    })
    //res.send(req.params)
})
app.get('/data/devices', (req, res) => {
    let sql = `SELECT * FROM devices WHERE input > 0`
    db.all(sql, (err, rows) => {
        rows = rows.map((row) => {
            row.lastMsg = new Date(new Date(Number(row.lastMsg))).toLocaleString('FI-fi', { timezone: 'Europe/Helsinki', hour12: false })
            return row
        })
        res.json(rows)
    })
    //res.send(req.params)
})
app.get('/data/log', (req, res) => {
    db.all("SELECT d.name, l.device, l.time, l.input, l.state FROM log l  LEFT JOIN devices d ON d.mac = l.device and d.input = l.input WHERE l.input > 0 ORDER BY time", (err, rows) => {
        if (err) return 0
        rows = rows.map((row) => {
            row.time = new Date(new Date(Number(row.time))).toLocaleString('FI-fi', { timezone: 'Europe/Helsinki', hour12: false })
            return row
        })
        res.json(rows)
        //res.send(req.params)
    })
})
app.post('/update/:MAC/:INPUT', (req, res) => {

    if (req.body.newName) {
        sql = `REPLACE INTO devices (mac, input, name) VALUES ("${req.params.MAC}", ${req.params.INPUT}, "${req.body.newName}")`
        db.all(sql, (err) => {
            if (err) console.log(err)
            res.render('chart.htm', { MAC: req.params.MAC, INPUT: req.params.INPUT })
        })

    } else {
        res.render('chart.htm', { MAC: req.params.MAC, INPUT: req.params.INPUT })
    }
})
app.use(express.static('www'))

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})
