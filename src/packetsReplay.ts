export class PacketsLogger {
    lastPacketTime = -1
    contents = ''
    logOnly = [] as string[]
    skip = [] as string[]

    logStr(str: string) {
        this.contents += `${str}\n`
    }

    log(isFromServer: boolean, packet: { name; state }, data: any) {
        if (this.logOnly.length > 0 && !this.logOnly.includes(packet.name)) {
            return
        }
        if (this.skip.length > 0 && this.skip.includes(packet.name)) {
            return
        }
        if (this.lastPacketTime === -1) {
            this.lastPacketTime = Date.now()
        }

        const diff = `+${Date.now() - this.lastPacketTime}`
        const str = `${isFromServer ? 'S' : 'C'} ${packet.state}:${packet.name} ${diff} ${JSON.stringify(data)}`
        this.logStr(str)
        this.lastPacketTime = Date.now()
    }
}

export type ParsedReplayPacket = {
    name: string
    params: any
    state: string
    diff: number
    isFromServer: boolean
}
export function parseReplayContents(contents: string) {
    const lines = contents.split('\n')

    const packets = [] as ParsedReplayPacket[]
    const repeatPoints = {} as {
        [label: string]: {
            startIndex: number
            // endIndex: number
            count: number
            delay: number
        }
    }
    for (let line of lines) {
        line = line.trim()
        if (!line || line.startsWith('#')) {
            if (line.toLowerCase().startsWith('#repeat')) {
                const [label, delay = 500, count = Infinity] = line.slice('#repeat'.length).split(' ')
                repeatPoints[label!] = {
                    count: Number(count),
                    delay: Number(delay),
                    startIndex: packets.length,
                }
            }
            continue
        }
        const [side, nameState, diff, ...data] = line.split(' ')
        const dataStr = data.join(' ');
        const parsed = dataStr === 'undefined' || dataStr === 'null' ? {} : JSON.parse(dataStr)
        const [state, name] = nameState!.split(':')
        if (name === 'bundle_delimiter' || name === 'keep_alive') continue
        packets.push({
            name: name!,
            state: state!,
            params: parsed,
            isFromServer: side!.toUpperCase() === 'S',
            diff: Number.parseInt(diff!.slice(1), 10),
        })
    }

    return {
        packets,
        repeatPoints
    }
}
