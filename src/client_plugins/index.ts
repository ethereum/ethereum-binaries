import fs from 'fs'
import path from 'path'
const clientFiles = fs.readdirSync(__dirname)
const clients : any = []
for (const client of clientFiles) {
  if (!client.startsWith('index')) {
    try {
      let config = require('./'+client).default
      clients.push(config)
    } catch (error) {
      
    }
  }
}
export { clients }