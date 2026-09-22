import { defineComponentMeta } from '../../../../runtime/types'

export default defineComponentMeta({
  tag: 'ew-hello-react',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
