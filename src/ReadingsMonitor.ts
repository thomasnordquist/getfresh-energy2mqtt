import { SmartMeter, PowerReading } from './Models'
import { EventEmitter } from 'events'
import { GetFreshEnergyApiClient } from './GetFreshEnergyApiClient'

export type ReadingCallback = (meter: SmartMeter, reading: PowerReading) => void

export class ReadingsMonitor extends EventEmitter {
  constructor(private apiClient: GetFreshEnergyApiClient, public meter: SmartMeter, public callback?: ReadingCallback) {
    super()
    this.startPolling()
  }
  public stop() {
    this.callback = undefined
  }
  private async startPolling() {
    const userInfo = await this.apiClient.getUserInfo()
    if (!userInfo) {
      throw new Error('no user info')
    }
    while (this.callback) {
      try {
        const consumption = await this.apiClient.getPowerReadings(this.meter.operatorId)
        consumption.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        if (consumption[0]) {
          this.callback(this.meter, consumption[0])
        }
      } catch (error) {
        console.error('failed updating consumption', error)
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}
