import { Bot } from 'mineflayer'
import { generateSpiralMatrix } from '@zardoy/flying-squid/dist/utils'
import ItemLoader from 'prismarine-item'
import { AuxClientsState, handleAuxClientsProxy, passthroughPackets } from './generalPacketsProxy'

export class MineflayerPacketHandler {
    private Item: ReturnType<typeof ItemLoader>
    auxHelpers: ReturnType<typeof handleAuxClientsProxy>
    loginState = ''

    constructor(private bot: Bot, private auxClientsState: AuxClientsState) {
        this.Item = ItemLoader(bot.version)
        this.setupPacketListeners()
        this.auxHelpers = handleAuxClientsProxy(this.bot._client, this.auxClientsState)
    }

    private setupPacketListeners() {
        // this.bot.on('move', () => {
        //     this.updateHealth()
        // })

        this.bot.on('health', () => {
            this.updateHealth()
        })

        this.patchBotMethods()
    }

    private writeClients(name: string, data: any, clients?: any[]) {
        this.auxHelpers.writeToAuxClients(name, data, clients)
    }

    private patchBotMethods() {
        const hookMethod = <T extends keyof Bot>(_name: T, callback: Function) => {
            const name = _name as string
            const oldMethod = this.bot[name].bind(this.bot)
            this.bot[name] = (...args: any[]) => {
                callback(...args)
                oldMethod(...args)
            }
        }

        hookMethod('closeWindow', () => {
            this.writeClients('closeWindow', {
                windowId: 0
            })
        })

        hookMethod('setQuickBarSlot', () => {
            this.updateSlot()
        })
    }

    updateSlot(clients?: any[]) {
        this.writeClients('held_item_slot', { slot: this.bot.quickBarSlot }, clients)
    }

    updateHealth(clients?: any[]) {
        this.writeClients('update_health', {
            food: this.bot.food,
            foodSaturation: this.bot.foodSaturation,
            health: this.bot.health
        }, clients)
    }

    handleNewConnection(client: any) {
        if (!this.auxHelpers.lastPackets.login) {
            client.end(`Bot was not logged in yet ${this.loginState}`)
            return
        }

        this.auxHelpers.onNewAuxConnection(client)

        this.auxHelpers.lastPackets.login.gameMode = this.bot.player.gamemode

        this.updateSlot([client])
        this.updateHealth([client])

        client.write('abilities', {
            flags: 0,
            walkingSpeed: 0,
            flyingSpeed: 0
        })

        client.write('window_items', {
            windowId: 0,
            stateId: 1,
            items: this.bot.inventory.slots.map(item => this.Item.toNotch(item)),
            carriedItem: this.Item.toNotch(this.bot.heldItem)
        })

        this.sendChunks(client)
    }

    private debug(...args: any[]) {
        console.log(...args)
    }

    private sendChunks(client: any) {
        this.debug(`sending chunks to new client viewer`)
        const botChunk = this.bot.entity.position.floored().scale(1 / 16).floored()
        for (const [xRel, zRel] of generateSpiralMatrix(8)) {
            const x = xRel + botChunk.x
            const z = zRel + botChunk.z
            const chunk = this.bot.world.getColumn(x, z) as any
            if (!chunk) continue
            const dumpedLights = chunk.dumpLight()
            const newLightsFormat = this.bot.supportFeature('newLightingDataFormat')
            const newLightsData = newLightsFormat ? { skyLight: dumpedLights.skyLight, blockLight: dumpedLights.blockLight } : undefined
            const chunkBuffer = chunk.dump()
            const bitMap = chunk.getMask()
            client.write('map_chunk', {
                x,
                z,
                groundUp: bitMap !== undefined ? true : undefined,
                trustEdges: true,
                bitMap: bitMap,
                biomes: chunk.dumpBiomes(),
                ignoreOldData: true,
                heightmaps: {
                    type: 'compound',
                    name: '',
                    value: {
                        MOTION_BLOCKING: { type: 'longArray', value: new Array(this.bot.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) },
                        WORLD_SURFACE: { type: 'longArray', value: new Array(this.bot.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) },
                    }
                },
                chunkData: chunkBuffer,
                blockEntities: [],
                skyLightMask: chunk.skyLightMask,
                emptySkyLightMask: chunk.emptySkyLightMask,
                blockLightMask: chunk.blockLightMask,
                emptyBlockLightMask: chunk.emptyBlockLightMask,
                ...newLightsData
            })
        }
    }
}
