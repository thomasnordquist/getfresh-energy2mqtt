import axios, { AxiosInstance } from 'axios'
const qs = require('qs');
const moment = require('moment')
import {LoginResponse, UserInfo, PowerReading, SmartMeter} from './Models'
import {connect} from 'mqtt'
import { EventEmitter } from 'events';

require('dotenv').config()

type ReadingCallback = (meter: SmartMeter, reading: PowerReading) => void

class ReadingsMonitor extends EventEmitter {
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
			throw new Error("no user info")
		}
		
		while (this.callback) {
			try {
				const consumption = await this.apiClient.getPowerReadings(this.meter.operatorId)
				consumption.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
				if (consumption[0]) {
					this.callback(this.meter, consumption[0])
				}
			} catch(error) {
				console.error('failed updating consumption', error)
			}

			await new Promise(resolve => setTimeout(resolve, 2000))
		}
	}
}

class GetFreshEnergyApiClient {
	private expiration: number = 0
	private loginResponse?: LoginResponse
	private sessionRenewalPromise?: Promise<void>

	constructor(private username: string, private password: string, private partner: 'fresh' | string){}

	public createMonitor(meter: SmartMeter, callback: ReadingCallback) {
		return new ReadingsMonitor(this, meter, callback)
	}

	private setLoginExpired() {
		this.expiration = 0
	}

	private async getValidApiSession(options?: {forLogin?: boolean}): Promise<AxiosInstance> {
		const clientForLogin = options && options.forLogin
		if (!clientForLogin) {
			await this.ensureSessionIsNotExpired()
		}

		const authenticationHeader = !clientForLogin && this.loginResponse ? {
			'Authorization': 'Bearer ' + (this.loginResponse ? this.loginResponse!.access_token : ''),
			'Cookie': 'auth=' + qs.stringify(this.loginResponse) + ';' + ' user-has-accepted-cookies=true;'
		} : {}

		return axios.create({
			baseURL: 'https://app.getfresh.energy/',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				...authenticationHeader
			},
			validateStatus: (status) => {
				if (status === 401) {
					this.setLoginExpired()
				} 
				return status >= 200 && status < 300; // default
			},
		})
	}

	private async ensureSessionIsNotExpired() {
		if (this.sessionRenewalPromise) {
			return this.sessionRenewalPromise
		}

		if (this.expiration < Date.now()) {
			console.log("Refresh session")
			try {
				this.sessionRenewalPromise = this.login()
				await this.sessionRenewalPromise
			} catch {
				throw new Error('Could not refresh session')
			}
		}
	}

	private async login(): Promise<void> {
		this.loginResponse = undefined

		const credentials = qs.stringify({
			'grant_type': 'password',
			'partner': this.partner,
			'password': this.password,
			'username': this.username
		})

		const optionsFormUrlEncoded = {
			headers: {
				'Content-type': 'application/x-www-form-urlencoded',
			}
		}

		const apiClient = await this.getValidApiSession()
		const response = await apiClient.post('auth/oauth/token', credentials, optionsFormUrlEncoded)

		this.loginResponse = response.data
		this.expiration = this.loginResponse ? Date.now() + this.loginResponse.expires_in  : 0
	}

	async getUserInfo(): Promise<UserInfo | undefined> {
		if (!this.loginResponse) {
			return
		}

		const userId = this.loginResponse.userId
		await this.ensureSessionIsNotExpired()
		try {
			const apiClient = await this.getValidApiSession()

			const response = await apiClient.get(`user-management/users/${userId}`)
			return response.data	
		} catch (error) {
			throw new Error("Could not load user info")
		}
	}

	async getPowerReadings(meterId: string): Promise<Array<PowerReading>> {
		let now = moment.utc().subtract('5', 'seconds').format().replace('Z', '.000Z')
		const apiClient = await this.getValidApiSession()
		const response = await apiClient.get(`readings/meters/${meterId}/latest?from=${now}`)
	
		return response.data.readings
	}
}

const client = connect('mqtt://nodered:1883')
const freshEnergy = new GetFreshEnergyApiClient(process.env.GETFRESH_USERNAME || '', process.env.GETFRESH_PASSWORD || '', 'fresh')

async function monitorConsumption() {
	const userInfo = await freshEnergy.getUserInfo()
	if (!userInfo) {
		throw Error("Could not load user info")
	}
  const firstMeter = userInfo.smartMeters[0]

	const monitor = freshEnergy.createMonitor(firstMeter, (consumption) => {
		client.publish('energy_meter', JSON.stringify(consumption))
	})
}

monitorConsumption()
