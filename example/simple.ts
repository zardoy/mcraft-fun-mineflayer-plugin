import { viewerConnector, onReady } from '../src/index'
import { createBot } from 'mineflayer'
import dotenv from 'dotenv'
import chalk from 'chalk'

dotenv.config({
    path: '.env.local',
})

const bot = createBot({
    host: process.env.HOST,

    // port: 25569,
    username: 'dklj',
})

bot.loadPlugin(viewerConnector({
    sendConsole: true,
    allowEval: true,
    password: '1',
}))

bot._client.on('connect', () => {
    console.log('connected')
})

bot.on('end', (err) => {
    console.error(err)
})
bot.on('error', (err) => {
    console.error(err)
})
bot.on('kicked', (err) => {
    console.error(err)
})
bot.on('spawn', () => {
    console.log('spawned')
})
bot.on('login', () => {
    console.log('logined')
})

bot.on('resourcePack', (url) => {
    bot.acceptResourcePack()
})

// setInterval(() => {
//     if (!bot.controlState) return
//     if (bot.controlState.forward) {
//         bot.controlState.forward = false
//         bot.controlState.back = true
//     } else {
//         bot.controlState.forward = true
//         bot.controlState.back = false
//     }
// }, 5000)

console.log('bot started')

onReady(bot).then(() => {
    bot.webViewer.ui.updateUI('status', {
        type: 'text',
        x: 10,
        y: 10,
        text: 'Hello, world!',
    })

    bot.webViewer.ui.updateLil('test', {
        input: 'test',
        button() {
            console.log(`button ${chalk.green('clicked')}`)
        }
    })
})
