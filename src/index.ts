import { connect } from 'mqtt'
import { GetFreshEnergyApiClient } from './GetFreshEnergyApiClient'
require('dotenv').config()

async function monitorConsumption() {
  const client = connect('mqtt://nodered:1883')

  if (!process.env.GETFRESH_USERNAME || !process.env.GETFRESH_PASSWORD) {
    throw Error('You need to provide GETFRESH_USERNAME and GETFRESH_PASSWORD ENV')
  }

  const freshEnergy = new GetFreshEnergyApiClient(process.env.GETFRESH_USERNAME, process.env.GETFRESH_PASSWORD, 'fresh')

  const userInfo = await freshEnergy.getUserInfo()
  if (!userInfo) {
    throw Error('Could not load user info')
  }

  const firstMeter = userInfo.smartMeters[0]
  freshEnergy.createMonitor(firstMeter, (meter, consumption) => {
    client.publish(`energy_meter/${meter.meterId}`, JSON.stringify(meter))
    client.publish(`energy_meter/${meter.meterId}/reading`, JSON.stringify(consumption))
  })
}

try {
  monitorConsumption()
} catch (error) {
  console.error(error)
  process.exit(1)
}
