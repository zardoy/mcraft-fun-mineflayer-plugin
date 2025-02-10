import { Client } from 'minecraft-protocol'
import { AuxClientsState, handleAuxClientsProxy } from '../generalPacketsProxy'

export const handleAuxClientsProxyVanilla = (serverConnection: Client, state: AuxClientsState) => {
    const result = handleAuxClientsProxy(serverConnection, state)
    const worldChunks = {} as Record<string, any>

    serverConnection.on('map_chunk', (data) => {
        worldChunks[`${data.x}_${data.z}`] = data
    })

    return {
        ...result,
        onNewAuxConnection: (client: Client) => {
            result.onNewAuxConnection(client)

            client.write('update_health', {
                food: 20,
                foodSaturation: 5,
                health: 20
            })

            client.write('abilities', {
                flags: 0,
                walkingSpeed: 0,
                flyingSpeed: 0
            })


            const writeWorldChunks = () => {
                for (const item of Object.values(worldChunks)) {
                    result.writeToAuxClients('map_chunk', item)
                }
            }

            setTimeout(() => {
                writeWorldChunks()
            }, 1000)
        }
    }
}
