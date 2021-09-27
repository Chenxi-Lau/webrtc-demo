/*
 * @Author: 刘晨曦
 * @Date: 2021-09-27 13:43:09
 * @LastEditTime: 2021-09-27 15:22:10
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \webrtc-demo\src\app.js
 */
const express = require('express')
const expressWs = require('express-ws')

const port = 3000
const app = express()
const wsInstance = expressWs(app)

// Websocket 接口
app.ws('/webrtc', ws => {
  ws.send(JSON.stringify({ type: '连接成功' }))
  ws.on('message', msg => {
    wsInstance.getWss().clients.forEach(server => {
      if (server !== ws) {
        server.send(msg)
      }
    })
  })
})

// 托管静态文件
app.use(express.static('public'))

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

