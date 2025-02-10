import React from 'react'
import styled from 'styled-components'
import { PacketFilter } from '../types'

const FilterContainer = styled.div`
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 8px;
    background: #2d2d2d;
`

const FilterRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`

const FilterInput = styled.input`
    flex: 1;
    padding: 8px;
    background: #3d3d3d;
    border: 1px solid #4d4d4d;
    border-radius: 4px;
    color: #fff;
    font-family: monospace;

    &:focus {
        outline: none;
        border-color: #666;
    }
`

const Label = styled.span`
    min-width: 80px;
    color: #888;
`

interface FilterBarProps {
    filters: PacketFilter
    setFilters: (filters: PacketFilter) => void
}

export function FilterBar({ filters, setFilters }: FilterBarProps) {
    return (
        <FilterContainer>
            <FilterRow>
                <Label>Filter:</Label>
                <FilterInput
                    value={filters.filter}
                    onChange={e => setFilters({ ...filters, filter: e.target.value })}
                    placeholder="e.g. position !chat entity* (use ! to exclude, * for wildcard)"
                />
            </FilterRow>
            <FilterRow>
                <Label>Highlight:</Label>
                <FilterInput
                    value={filters.highlight}
                    onChange={e => setFilters({ ...filters, highlight: e.target.value })}
                    placeholder="e.g. chat entity*"
                />
            </FilterRow>
        </FilterContainer>
    )
}
