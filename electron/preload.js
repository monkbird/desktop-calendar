import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0'
})
