import fs from 'fs'
const clientFiles = fs.readdirSync(__dirname)
const clients : any = {}
for (const client of clientFiles) {
  clients[client.replace('.js', '')] = require('./'+client).default
}
export { clients }