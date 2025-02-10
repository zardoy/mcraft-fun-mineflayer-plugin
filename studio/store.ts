import { proxy, subscribe } from 'valtio'

interface PacketStats {
    [packetName: string]: {
        lastSecond: number
        total: number
    }
}

interface StatsStore {
    packetStats: PacketStats
    lastUpdate: number
}

export const statsStore = proxy<StatsStore>({
    packetStats: {},
    lastUpdate: Date.now()
})

// Reset packet rates every second
setInterval(() => {
    for (const packetName in statsStore.packetStats) {
        statsStore.packetStats[packetName].lastSecond = 0
    }
    statsStore.lastUpdate = Date.now()
}, 1000)

export const trackPacket = (packetName: string) => {
    if (!statsStore.packetStats[packetName]) {
        statsStore.packetStats[packetName] = {
            lastSecond: 0,
            total: 0
        }
    }

    statsStore.packetStats[packetName].lastSecond++
    statsStore.packetStats[packetName].total++
}
