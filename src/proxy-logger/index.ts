import { Client, createClient, createServer, Server, ServerClient, states, States } from 'minecraft-protocol'
import { createPacketsStudioServer, handlePacket as wsHandlePacket, handleClientDisconnect } from './studioServer'
import { handleAuxClientsProxyVanilla } from './vanillaAuxClients'

const username = process.argv[2] || 'hiall2'
const connection = process.argv[3] || 'grim.mcraft.fun'
// const version = process.argv[4] || undefined
const version = '1.20.4'
const port = process.argv[5] || undefined
const [host, serverPort] = connection.split(':')

const onlyPlayState = true

export const createProxyServer = () => {
    createPacketsStudioServer()

    const currentState = {
        leadingConnection: 0,
        // packetsReceivedInSession: 0,
        // packetsSentInSession: 0,
    }

    const server = createServer({
        'online-mode': false,
        port: port ? parseInt(port) : 25565,
        keepAlive: false,
        version,
    }) as Server


    const handlePacket = (name: string, data: any, isFromServer: boolean, connectionIndex: number, state: States, buffer?: Buffer) => {
        wsHandlePacket(connectionIndex, isFromServer, name, data, state, buffer)
    }

    const auxClients = [] as Client[]
    let serverClient: Client | undefined
    let auxHelpers: ReturnType<typeof handleAuxClientsProxyVanilla> | undefined
    let targetClientConnectionIndex: number | undefined

    const startTargetClient = () => {
        serverClient = createClient({
            host,
            port: serverPort ? parseInt(serverPort) : 25565,
            version: version || undefined,
            keepAlive: false,
            username,
        })

        auxHelpers = handleAuxClientsProxyVanilla(serverClient, {
            auxClients
        })
    }

    const handleNewClient = (proxyClient: ServerClient) => {
        if (!serverClient) {
            startTargetClient()
            targetClientConnectionIndex = proxyClient.id
        } else {
            auxClients.push(proxyClient)
            auxHelpers!.onNewAuxConnection(proxyClient)
        }

        const connectionIndex = proxyClient.id
        let writeCurrentBypass = false
        const oldWrite = proxyClient.write.bind(proxyClient)
        proxyClient.write = (name, data) => {
            if (proxyClient.state !== states.PLAY && !writeCurrentBypass && !onlyPlayState) {
                console.log('skipping', name, data)
                return
            }

            writeCurrentBypass = false
            oldWrite(name, data)
        }

        proxyClient.on('end', () => {
            console.log('proxy client disconnected', connectionIndex === targetClientConnectionIndex, connectionIndex)
            handleClientDisconnect(connectionIndex)
        })

        serverClient!.on('packet', (data, meta, buffer, fullBuffer) => {
            handlePacket(meta.name as any, data, true, connectionIndex, meta.state as States, buffer)

            if ((meta.state !== states.PLAY || proxyClient.state !== states.PLAY) && onlyPlayState) {
                return
            }

            if (!onlyPlayState && meta.state !== proxyClient.state) {
                proxyClient.state = meta.state
            }

            writeCurrentBypass = true
            proxyClient.write(meta.name, data)
            if (meta.name === 'set_compression') {
                serverClient!.compressionThreshold = data.threshold
            }
        })

        proxyClient.on('packet', (data, meta, buffer, fullBuffer) => {
            if (targetClientConnectionIndex === connectionIndex) {
                auxHelpers!.writeMainClientPackets(meta.name, data)
            }

            handlePacket(meta.name as any, data, false, connectionIndex, meta.state as States, buffer)
            if ((meta.state !== states.PLAY || serverClient!.state !== states.PLAY) && onlyPlayState) {
                return
            }

            // const packetData = target.deserializer.parsePacketBuffer(fullBuffer).data.params
            // console.log('writing', meta.name, packetData)
            // target.writeRaw(fullBuffer)

            if (connectionIndex === currentState.leadingConnection) {
                serverClient!.write(meta.name, data)
            }
        })
    };
    server.on(onlyPlayState ? 'login' : 'connection' as any, client => {
        if (targetClientConnectionIndex === undefined) {
            handleNewClient(client);
        }
    })
    server.on('playerJoin', (client) => {
        if (targetClientConnectionIndex !== undefined && targetClientConnectionIndex !== client.id) {
            handleNewClient(client);
        }
    })
}

createProxyServer()
