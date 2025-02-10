import React, { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { Connection, PacketFilter } from '../types'
import { PacketTile } from './PacketTile'

const Column = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 300px;
    max-width: 400px;
    background: #2d2d2d;
    border-radius: 8px;
    overflow: hidden;
`

const Header = styled.div<{ isLeading: boolean }>`
    padding: 12px;
    background: #3d3d3d;
    font-weight: bold;
    color: ${props => props.isLeading ? '#76ff03' : '#fff'};
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const Stats = styled.div`
    color: #888;
    font-size: 0.9em;
`

const PacketList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #2d2d2d;
    }

    &::-webkit-scrollbar-thumb {
        background: #4d4d4d;
        border-radius: 4px;
    }
`

interface ConnectionColumnProps {
    connection: Connection
    filters: PacketFilter
    stats: {
        hidden: number
        matched: number
    }
}

export function ConnectionColumn({ connection, filters, stats }: ConnectionColumnProps) {
    const listRef = useRef<HTMLDivElement>(null)
    const shouldScrollRef = useRef(true)

    // Handle scroll events to determine if we should auto-scroll
    const handleScroll = () => {
        const element = listRef.current
        if (!element) return

        const distanceFromBottom = element.scrollHeight - (element.scrollTop + element.clientHeight)
        // If we're within 50px of the bottom, enable auto-scroll
        shouldScrollRef.current = distanceFromBottom < 50
    }

    // Auto-scroll if needed
    useEffect(() => {
        const element = listRef.current
        if (shouldScrollRef.current && element) {
            requestAnimationFrame(() => {
                element.scrollTop = element.scrollHeight
            })
        }
    }, [connection.packets])

    // Filter packets
    const filteredPackets = connection.packets.filter(packet => {
        if (!filters.filter) return true
        const name = packet.name.toLowerCase()
        return filters.filter.toLowerCase().split(' ').every(term => {
            if (term.startsWith('!')) {
                return !name.includes(term.slice(1))
            }
            if (term.includes('*')) {
                const regex = new RegExp(term.replace('*', '.*'))
                return regex.test(name)
            }
            return name.includes(term)
        })
    })

    return (
        <Column>
            <Header isLeading={connection.isLeading}>
                <span>Connection {connection.index}</span>
                <Stats>
                    {stats.hidden > 0 && <span>Hidden: {stats.hidden} </span>}
                    {stats.matched > 0 && <span>Matched: {stats.matched}</span>}
                </Stats>
            </Header>
            <PacketList
                ref={listRef}
                onScroll={handleScroll}
            >
                {filteredPackets.slice(-200).map((packet, i) => (
                    <PacketTile
                        key={`${packet.timestamp}-${i}`}
                        packet={packet}
                        filters={filters}
                    />
                ))}
            </PacketList>
        </Column>
    )
}
