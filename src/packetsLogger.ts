export interface PacketsFileHeader {
    formatVersion: number
    minecraftVersion: string
}

export class PacketsLogger {
    lastPacketTime = -1
    contents = ''
    relativeTime = true
    formattedTime = false
    logOnly = [] as string[]
    skip = [] as string[]

    constructor(public header: Pick<PacketsFileHeader, 'minecraftVersion'> & Record<string, any>) {
        this.logStr(`${JSON.stringify(header)}\n`)
    }

    logStr(str: string) {
        this.contents += `${str}\n`
    }

    formatTime(time: number): string {
        const date = new Date(time)
        const hours = date.getHours().toString().padStart(2, '0')
        const minutes = date.getMinutes().toString().padStart(2, '0')
        const seconds = date.getSeconds().toString().padStart(2, '0')
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0').slice(0, 2)
        return `${hours}:${minutes}:${seconds}.${milliseconds}`
    }

    log(isFromServer: boolean, packet: { name; state, time?: number }, data: any) {
        if (this.logOnly.length > 0 && !this.logOnly.includes(packet.name)) {
            return
        }
        if (this.skip.length > 0 && this.skip.includes(packet.name)) {
            return
        }

        const time = packet.time ?? Math.floor(performance.now())
        if (this.lastPacketTime === -1) {
            this.lastPacketTime = time
        }

        let diff = ''
        if (this.formattedTime) {
            diff = this.formatTime(time)
        } else if (this.relativeTime) {
            diff = `+${time - this.lastPacketTime}`
        } else {
            diff = `${time}`
        }
        const str = `${isFromServer ? 'S' : 'C'} ${packet.state}:${packet.name} ${diff} ${processPacketDataForLogging(data)}`
        this.logStr(str)
        this.lastPacketTime = time
    }
}

export const processPacketDataForLogging = (data: any) => {
    const normalize = (value: any): any => {
        if (typeof value === 'bigint') return Number(value)
        return value
    }

    const check = (value: any): any => {
        if (value === null || value === undefined) {
            return value
        }

        if (Array.isArray(value)) {
            return value.map(check)
        }

        if (typeof value === 'object' && !(value instanceof Uint8Array)) {
            const result: any = {}
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    result[key] = check(value[key])
                }
            }
            return result
        }

        return normalize(value)
    }

    return JSON.stringify(check(data))
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
    if (!lines[0]) {
        throw new Error('No header line found. Cannot parse replay definition.')
    }
    let header: PacketsFileHeader
    try {
        header = JSON.parse(lines[0])
    } catch (err) {
        throw new Error(`Invalid JSON in file header: ${String(err)}`)
    }
    const packetsRaw = lines.slice(1).join('\n')

    const packets = [] as ParsedReplayPacket[]
    const repeatPoints = {} as {
        [label: string]: {
            startIndex: number
            count: number
            delay: number
        }
    }
    let lastTime = -1

    for (let line of packetsRaw.split('\n')) {
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

        let computedDiff = 0;
        let timestamp = 0;

        // Handle different timestamp formats
        if (diff!.includes(':')) {
            // Handle formatted time (HH:MM:SS.mm)
            const parts = diff!.split(':')
            if (parts.length >= 3) {
                const hours = parseInt(parts[0] || '0')
                const minutes = parseInt(parts[1] || '0')
                const secondsParts = (parts[2] || '0').split('.')
                const seconds = parseInt(secondsParts[0] || '0')
                const milliseconds = parseInt(secondsParts[1] || '0') * 10

                timestamp = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds
                computedDiff = lastTime === -1 ? 0 : timestamp - lastTime
                lastTime = timestamp
            }
        } else if (diff!.startsWith('+')) {
            // Handle relative time
            computedDiff = parseInt(diff!.slice(1))
        } else {
            // Handle absolute time
            timestamp = parseInt(diff!)
            computedDiff = lastTime === -1 ? 0 : timestamp - lastTime
            lastTime = timestamp
        }

        packets.push({
            name: name!,
            state: state!,
            params: parsed,
            isFromServer: side!.toUpperCase() === 'S',
            diff: computedDiff,
        })
    }

    return {
        packets,
        repeatPoints,
        header
    }
}
