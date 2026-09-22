import { useReactEmit } from '@ew/runtime'

export interface HelloReactProps {
  name?: string
  count?: number
  autoLoad?: boolean
}

export default function HelloReact({ name = 'World', count = 0 }: HelloReactProps) {
  const emit = useReactEmit()

  return (
    <button
      type="button"
      className="ew-hello-react"
      onClick={() => emit('select', { source: 'hello-react', name })}
    >
      {`React 组件：${name} × ${count}`}
    </button>
  )
}
