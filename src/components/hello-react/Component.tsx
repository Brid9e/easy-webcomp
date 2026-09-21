import { useEmit } from '../../runtime/react'

export interface HelloReactProps {
  name?: string
  count?: number
  autoLoad?: boolean
}

export default function HelloReact({ name = 'World', count = 0 }: HelloReactProps) {
  const emit = useEmit()

  return (
    <button
      type="button"
      className="ctc-hello"
      onClick={() => emit('select', { source: 'hello-react', name })}
    >
      {`React 组件：${name} × ${count}`}
    </button>
  )
}
