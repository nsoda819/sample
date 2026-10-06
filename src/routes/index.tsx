import { createFileRoute } from '@tanstack/react-router'
import { YohakuApp } from '../components/yohaku-app'

export const Route = createFileRoute('/')({
  component: YohakuApp,
})
