import React, { useState } from 'react'
import styled from 'styled-components'
import { PacketData, PacketFilter } from '../types'

const Tile = styled.div<{ isFromServer: boolean; isHighlighted: boolean }>`
    background: ${props => props.isFromServer ? '#4a2f2f' : '#2f4a2f'};
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    opacity: ${props => props.isHighlighted ? 1 : 0.7};
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover {
        opacity: 1;
    }
`

const PacketName = styled.div`
    font-weight: bold;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const State = styled.span`
    color: #888;
    font-size: 0.8em;
`

const DataContainer = styled.pre`
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 0.9em;
    max-height: 200px;
    overflow-y: auto;
`

interface PacketTileProps {
    packet: PacketData
    filters: PacketFilter
}

// Add custom formatters for specific packet types
const customFormatters: Record<string, (data: any) => any> = {
    'position': (data) => ({
        x: Math.round(data.x * 100) / 100,
        y: Math.round(data.y * 100) / 100,
        z: Math.round(data.z * 100) / 100,
        ...data
    }),
    'entity_velocity': (data) => ({
        ...data,
        velocityX: Math.round(data.velocityX * 100) / 100,
        velocityY: Math.round(data.velocityY * 100) / 100,
        velocityZ: Math.round(data.velocityZ * 100) / 100,
    })
}

export function PacketTile({ packet, filters }: PacketTileProps) {
    const [expanded, setExpanded] = useState(false)

    const isHighlighted = !filters.highlight || filters.highlight.split(' ').some(term => {
        if (term.includes('*')) {
            const regex = new RegExp(term.replace('*', '.*'))
            return regex.test(packet.name.toLowerCase())
        }
        return packet.name.toLowerCase().includes(term.toLowerCase())
    })

    const formatData = (data: any) => {
        const formatter = customFormatters[packet.name]
        const formattedData = formatter ? formatter(data) : data
        return JSON.stringify(formattedData, null, expanded ? 2 : 0)
    }

    return (
        <Tile
            isFromServer={packet.isFromServer}
            isHighlighted={isHighlighted}
            onClick={() => setExpanded(!expanded)}
        >
            <PacketName>
                {packet.name}
                <State>{packet.state}</State>
            </PacketName>
            <DataContainer>
                {formatData(packet.data)}
            </DataContainer>
        </Tile>
    )
}
