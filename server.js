const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

const users = {}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  // Register with a Qubic address
  socket.on('register', (address) => {
    users[address] = socket.id
    socket.address = address
    console.log(`Registered: ${address}`)
    io.emit('online-users', Object.keys(users))
  })

  // WebRTC signaling
  socket.on('call-user', ({ to, offer, callType }) => {
    const toSocket = users[to]
    if (toSocket) {
      io.to(toSocket).emit('incoming-call', {
        from: socket.address, offer, callType
      })
    }
  })

  socket.on('call-answer', ({ to, answer }) => {
    const toSocket = users[to]
    if (toSocket) {
      io.to(toSocket).emit('call-answered', { answer })
    }
  })

  socket.on('ice-candidate', ({ to, candidate }) => {
    const toSocket = users[to]
    if (toSocket) {
      io.to(toSocket).emit('ice-candidate', { candidate })
    }
  })

  // Encrypted messaging
  socket.on('send-message', ({ to, encryptedPayload }) => {
    const toSocket = users[to]
    if (toSocket) {
      io.to(toSocket).emit('receive-message', {
        from: socket.address,
        encryptedPayload,
        time: new Date().toISOString()
      })
    }
  })

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.address) {
      delete users[socket.address]
      io.emit('online-users', Object.keys(users))
      console.log(`Disconnected: ${socket.address}`)
    }
  })
})

app.get('/', (req, res) => res.send('Qubic Messenger signaling server running ✅'))

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🔐 Qubic signaling server running on port ${PORT}`)
})