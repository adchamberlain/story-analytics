import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core'

// ── Test draggable hook ─────────────────────────────────────────────────────

function TestDraggableCard({ chartId }: { chartId: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `chart-${chartId}`,
    data: { chartId },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-testid={`draggable-${chartId}`}
    >
      Chart {chartId}
    </div>
  )
}

// ── Test droppable hook ─────────────────────────────────────────────────────

function TestDroppableFolder({ folderId, label }: { folderId: string | null; label: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folderId ?? 'unfiled'}`,
    data: { folderId },
  })

  return (
    <div
      ref={setNodeRef}
      data-testid={`droppable-${folderId ?? 'unfiled'}`}
      style={{ background: isOver ? 'blue' : 'transparent' }}
    >
      {label}
    </div>
  )
}

// ── PointerEvent polyfill for jsdom ─────────────────────────────────────────

beforeEach(() => {
  if (typeof PointerEvent === 'undefined') {
    // @ts-expect-error PointerEvent polyfill for jsdom
    global.PointerEvent = class PointerEvent extends MouseEvent {
      pointerId: number
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params)
        this.pointerId = params.pointerId ?? 0
      }
    }
  }
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Drag-and-Drop Folders', () => {
  it('chart card has draggable attributes', () => {
    render(
      <DndContext>
        <TestDraggableCard chartId="abc" />
      </DndContext>
    )

    const card = screen.getByTestId('draggable-abc')
    expect(card).toBeDefined()
    // useDraggable adds role="button" and tabIndex for keyboard accessibility
    expect(card.getAttribute('role')).toBe('button')
    expect(card.getAttribute('tabindex')).toBe('0')
  })

  it('folder has droppable target', () => {
    render(
      <DndContext>
        <TestDroppableFolder folderId="folder-1" label="My Folder" />
      </DndContext>
    )

    const folder = screen.getByTestId('droppable-folder-1')
    expect(folder).toBeDefined()
    expect(folder.textContent).toBe('My Folder')
  })

  it('unfiled folder has droppable target with null folderId', () => {
    render(
      <DndContext>
        <TestDroppableFolder folderId={null} label="Unfiled" />
      </DndContext>
    )

    const unfiled = screen.getByTestId('droppable-unfiled')
    expect(unfiled).toBeDefined()
    expect(unfiled.textContent).toBe('Unfiled')
  })

  it('drag end calls moveToFolder handler', () => {
    const moveToFolder = vi.fn()

    const handleDragEnd = (event: { active: { data: { current?: { chartId?: string } } }; over: { data: { current?: { folderId?: string | null } } } | null }) => {
      const chartId = event.active.data.current?.chartId
      const folderId = event.over?.data.current?.folderId ?? null
      if (chartId) moveToFolder(chartId, folderId)
    }

    // Simulate what happens during a drag end
    handleDragEnd({
      active: { data: { current: { chartId: 'chart-1' } } },
      over: { data: { current: { folderId: 'folder-2' } } },
    })

    expect(moveToFolder).toHaveBeenCalledWith('chart-1', 'folder-2')
  })

  it('drag end with null folderId moves to unfiled', () => {
    const moveToFolder = vi.fn()

    const handleDragEnd = (event: { active: { data: { current?: { chartId?: string } } }; over: { data: { current?: { folderId?: string | null } } } | null }) => {
      const chartId = event.active.data.current?.chartId
      const folderId = event.over?.data.current?.folderId ?? null
      if (chartId) moveToFolder(chartId, folderId)
    }

    handleDragEnd({
      active: { data: { current: { chartId: 'chart-1' } } },
      over: { data: { current: { folderId: null } } },
    })

    expect(moveToFolder).toHaveBeenCalledWith('chart-1', null)
  })
})
