import React, { useEffect, useState, useCallback } from 'react'
import { Connection, PacketData, PacketFilter, WSMessage } from './types'
import styled from 'styled-components'
import { ConnectionColumn } from './components/ConnectionColumn'
import { FilterBar } from './components/FilterBar'
import { StatsBar } from './components/StatsBar'
import { trackPacket } from './store'

const MAX_PACKETS = 200

const AppContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e1e;
    color: #fff;
`

const ColumnsContainer = styled.div`
    display: flex;
    flex: 1;
    overflow-x: auto;
    padding: 16px;
    gap: 16px;
`

const ConnectionStatus = styled.div<{ connected: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: ${props => props.connected ? '#4caf50' : '#f44336'};
    position: absolute;
    top: 8px;
    left: 8px;
`

export function App() {
    const [ws, setWs] = useState<WebSocket | null>(null)
    const [connected, setConnected] = useState(false)
    const [connections, setConnections] = useState<Map<number, Connection>>(new Map())
    const [filters, setFilters] = useState<PacketFilter>({ filter: '', highlight: '' })

    const handleMessage = useCallback((message: WSMessage) => {
        if (message.type === 'packet') {
            trackPacket(message.name)
            setConnections(prev => {
                const next = new Map(prev)
                const connection = next.get(message.connectionIndex) || {
                    index: message.connectionIndex,
                    isLeading: false,
                    packets: [],
                    hidden: 0,
                    matched: 0
                }

                // Keep only the last MAX_PACKETS
                if (connection.packets.length >= MAX_PACKETS) {
                    connection.packets = connection.packets.slice(-MAX_PACKETS + 1)
                }
                connection.packets.push(message)
                next.set(message.connectionIndex, connection)
                return next
            })
        } else if (message.type === 'clientDisconnect') {
            // Handle disconnect if needed
        }
    }, [])

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8089')

        ws.onopen = () => {
            setConnected(true)
            setWs(ws)
        }

        ws.onclose = () => {
            setConnected(false)
            setWs(null)
        }

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as WSMessage
            handleMessage(message)
        }

        return () => {
            ws.close()
        }
    }, [])

    const applyFilters = useCallback((connection: Connection) => {
        const { filter, highlight } = filters
        let hidden = 0
        let matched = 0

        connection.packets.forEach(packet => {
            const name = packet.name.toLowerCase()
            if (filter) {
                const terms = filter.toLowerCase().split(' ')
                const matches = terms.every(term => {
                    if (term.startsWith('!')) {
                        return !name.includes(term.slice(1))
                    }
                    if (term.includes('*')) {
                        const regex = new RegExp(term.replace('*', '.*'))
                        return regex.test(name)
                    }
                    return name.includes(term)
                })
                if (!matches) hidden++
            }

            if (highlight) {
                const terms = highlight.toLowerCase().split(' ')
                const matches = terms.some(term => {
                    if (term.includes('*')) {
                        const regex = new RegExp(term.replace('*', '.*'))
                        return regex.test(name)
                    }
                    return name.includes(term)
                })
                if (matches) matched++
            }
        })

        return { hidden, matched }
    }, [filters])

    // Test function to simulate receiving packets
    // const testReceivePacket = () => {
    //     const testPacket: PacketData = {
    //         connectionIndex: Math.floor(Math.random() * 3),
    //         isFromServer: Math.random() > 0.5,
    //         name: 'test_packet',
    //         data: { test: 'data' },
    //         timestamp: Date.now(),
    //         type: 'packet',
    //         state: 'PLAY'
    //     }
    //     handleMessage(testPacket)
    // }

    return (
        <AppContainer>
            <ConnectionStatus connected={connected} />
            <FilterBar filters={filters} setFilters={setFilters} />
            <ColumnsContainer>
                {Array.from(connections.values()).map(connection => (
                    <ConnectionColumn
                        key={connection.index}
                        connection={connection}
                        filters={filters}
                        stats={applyFilters(connection)}
                    />
                ))}
            </ColumnsContainer>
            <StatsBar />
        </AppContainer>
    )
}
