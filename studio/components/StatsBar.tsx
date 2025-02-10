import React, { useMemo } from 'react'
import styled from 'styled-components'
import { useSnapshot } from 'valtio'
import { statsStore } from '../store'

const StatsContainer = styled.div`
    background: #2d2d2d;
    padding: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-family: monospace;
    font-size: 0.9em;
    border-top: 1px solid #3d3d3d;
`

const StatItem = styled.div<{ rate: number }>`
    display: flex;
    gap: 8px;
    align-items: center;
    color: ${props => {
        if (props.rate === 0) return '#666'
        if (props.rate < 10) return '#4caf50'
        if (props.rate < 50) return '#ff9800'
        return '#f44336'
    }};
`

const PacketName = styled.span`
    color: #888;
`

const Rate = styled.span`
    min-width: 40px;
    text-align: right;
`

export function StatsBar() {
    const stats = useSnapshot(statsStore)

    const sortedStats = useMemo(() => {
        return Object.entries(stats.packetStats)
            .sort((a, b) => b[1].lastSecond - a[1].lastSecond)
            .filter(([_, stat]) => stat.lastSecond > 0 || stat.total > 0)
            .slice(0, 15) // Show top 15 most active packets
    }, [stats.lastUpdate])

    if (sortedStats.length === 0) return null

    return (
        <StatsContainer>
            {sortedStats.map(([name, stat]) => (
                <StatItem key={name} rate={stat.lastSecond}>
                    <PacketName>{name}:</PacketName>
                    <Rate>{stat.lastSecond}/s</Rate>
                </StatItem>
            ))}
        </StatsContainer>
    )
}
