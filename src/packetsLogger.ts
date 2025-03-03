export interface PacketsFileHeader {
    formatVersion: number
    minecraftVersion: string
}

export class PacketsLogger {
    lastPacketTime = -1
    contents = ''
    relativeTime = true
    logOnly = [] as string[]
    skip = [] as string[]

    constructor(public header: Pick<PacketsFileHeader, 'minecraftVersion'> & Record<string, any>) {
        this.logStr(`${JSON.stringify(header)}\n`)
    }

    logStr(str: string) {
        this.contents += `${str}\n`
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
        if (this.relativeTime) {
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
        if (typeof value === 'bigint') {
            return Number(value)
        }
        if (Array.isArray(value)) {
            return value.map(normalize)
        }
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, normalize(v)])
            )
        }
        return value
    }
    return JSON.stringify(normalize(data))
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

        // Handle both relative (+123) and absolute (123) timestamps
        const timestamp = diff!.startsWith('+') ?
            Number.parseInt(diff!.slice(1), 10) : // Relative time - use as is
            Number.parseInt(diff!, 10); // Absolute time

        // For absolute timestamps, compute the relative diff from the previous packet
        const computedDiff = diff!.startsWith('+') ? timestamp :
            (lastTime === -1 ? 0 : timestamp - lastTime);

        // Update lastTime for absolute timestamps
        if (!diff!.startsWith('+')) {
            lastTime = timestamp;
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
