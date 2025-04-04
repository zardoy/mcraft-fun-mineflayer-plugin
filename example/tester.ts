import { viewerConnector, onReady } from '../src/index'
import { createBot } from 'mineflayer'
import dotenv from 'dotenv'
import chalk from 'chalk'

dotenv.config({
    path: '.env.local',
})

const bot = createBot({
    // host: process.env.HOST,
    host: 'kaboom.pw',
    // port: 25569,

    username: 'dar',
    version: '1.20.4',
})

let activeConnections = 0
const updateConnectionsUI = () => {
    bot.webViewer.ui.updateUI('connections', {
        type: 'text',
        text: `{icon:eye} ${activeConnections}`,
        x: 5,
        y: 5,
    })
}

bot.loadPlugin(viewerConnector({
    sendConsole: true,
    allowEval: true,
    forwardChat: true,
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

bot.on('diggingCompleted', () => {
    console.log('diggingCompleted')
})
bot.on('diggingAborted', () => {
    console.log('diggingAborted')
})
bot.on('chat', (message) => {
    console.log('chat', message)
})

bot.on('resourcePack', (url) => {
    console.log('accepting resource pack')
    bot.acceptResourcePack()
})

let block
onReady(bot).then(() => {
    let recording = false
    const upControls = () => {
        // Add interactive controls
        bot.webViewer.ui.updateLil('controls', {
            forward: false,
            backwards: false,
            left: false,
            right: false,
            sneak: false,
            async jump() {
                await bot.setControlState('jump', true)
                setTimeout(() => bot.setControlState('jump', false), 100)
            },
            chat() {
                bot.chat('Hello')
            },
            lookAtGrass() {
                block = bot.findBlock({
                    matching(b) {
                        return b.name.includes('grass')
                    }
                })
                console.log('Now looking at', block.name)
                bot.lookAt(block.position)
            },
            lookAtBlockBelow() {
                block = bot.world.getBlock(bot.entity.position.offset(0, -1, 0))
                console.log('Now looking at', block.name)
                bot.lookAt(block.position)
            },
            startDigging() {
                bot.dig(block)
            },
            stopDigging() {
                bot.stopDigging()
            },
            activateItem() {
                bot.activateItem()
            },
            lookRight() {
                bot.look(bot.entity.yaw - 1, bot.entity.pitch)
            },
            lookLeft() {
                bot.look(bot.entity.yaw + 1, bot.entity.pitch)
            },
            lookUp() {
                bot.look(bot.entity.yaw, bot.entity.pitch + 1)
            },
            lookDown() {
                bot.look(bot.entity.yaw, bot.entity.pitch - 1)
            },
            saveWorldIntoFile() {
                bot.webViewer._unstable.createStateCaptureFile('world')
            },
            [recording ? 'saveRecording' : 'startRecording']() {
                if (recording) {
                    bot.webViewer._unstable.startRecording()
                } else {
                    bot.webViewer._unstable.stopRecording('recording')
                }
                recording = !recording
                upControls()
            },
            // placeBlock() {
            //     // bot.placeBlock(block)
            // }
        }, {
            // Optional callback when values change
            onUpdate(id, newValue) {
                if (id === 'forward') {
                    bot.setControlState('forward', newValue)
                } else if (id === 'backwards') {
                    bot.setControlState('back', newValue)
                } else if (id === 'left') {
                    bot.setControlState('left', newValue)
                } else if (id === 'right') {
                    bot.setControlState('right', newValue)
                } else if (id === 'sneak') {
                    bot.setControlState('sneak', newValue)
                }
            }
        })
    }
    upControls()
    // Track connections
    const { _tcpServer, _wsServer } = bot.webViewer

    const handleNewConnection = (client) => {
        activeConnections++
        updateConnectionsUI()

        // Track when this client disconnects
        client.on('end', () => {
            activeConnections--
            updateConnectionsUI()
        })
    }

    _tcpServer?.on('connection', handleNewConnection)
    _wsServer?.on('connection', handleNewConnection)

    // Initialize UI
    updateConnectionsUI()
})
