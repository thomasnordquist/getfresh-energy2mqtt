const axios = require('axios')
const qs = require('qs');
const moment = require('moment')
import {LoginResponse, UserInfo, PowerReading} from './Models'
import {connect} from 'mqtt'

require('dotenv').config()

class Api {
	private expiration: number = 0
	private loginInfo?: LoginResponse

	constructor(private username: string, private password: string){}

	private baseHeaders = () => {
		return ({
			'Accept': 'application/json, text/plain, */*',
			'Authorization': 'Bearer ' + (this.loginInfo ? this.loginInfo!.access_token : ''),
			'Cookie': 'auth=' + qs.stringify(this.loginInfo) + ';' + ' user-has-accepted-cookies=true;'
	})
}

	public async getLiveConsumption(readingCallback: (reading: PowerReading) => void) {
		await this.ensureSessionIsNotExpired()
		const userInfo = await this.getUserInfo()
		if (!userInfo) {
			throw new Error("no user info")
		}
		const meterId = userInfo.smartMeters[0].operatorId
		
		while (true) {
			try {
				const consumption = await this.getConsumption(meterId)
				consumption.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
				if (consumption[0]) {
					readingCallback(consumption[0])
				}
			} catch(error) {
				console.error('failed updating consumption', error)
			}

			await new Promise(resolve => setTimeout(resolve, 2000))
		}

	}

	private async ensureSessionIsNotExpired() {
		if (this.expiration < Date.now()) {
			console.log("Refresh session")
			try {
				const loginInfo = await this.login()
				this.loginInfo = loginInfo
				this.expiration = Date.now() + loginInfo.expires_in
			} catch {
				throw new Error('Could not refresh session')
			}
		}
	}

	private async login(): Promise<LoginResponse> {
		let response = await axios({
				method: 'post',
				url: 'https://app.getfresh.energy/auth/oauth/token',
				data: qs.stringify({
					'grant_type': 'password',
					'partner': 'fresh',
					'password': this.password,
					'username': this.username
				}),
				headers: {
					'Accept': 'application/json, text/plain, */*',
					'Content-type': 'application/x-www-form-urlencoded',
				}
		})
	
		return response.data
	}

	async getUserInfo(): Promise<UserInfo | undefined> {
		if (!this.loginInfo) {
			return
		}

		const userId = this.loginInfo.userId
		await this.ensureSessionIsNotExpired()
		try {
			let response = await axios({
				headers: {
					...this.baseHeaders(), 
					"x-requested-by": "webclient",
					"accept": "application/json, text/plain, */*",
					"referer": "https://app.getfresh.energy/",
				},
				method: 'get',
				url: 'https://app.getfresh.energy/user-management/users/' + userId,

			})
			return response.data	

		} catch (error) {
			throw new Error("Could not load user info")
		}
	}

	async getConsumption(meterId: string): Promise<Array<PowerReading>> {
		let now = moment.utc().subtract('5', 'seconds').format().replace('Z', '.000Z')
		let response = await axios({
			headers: this.baseHeaders(),
			method: 'get',
			url: `https://app.getfresh.energy/readings/meters/${meterId}/latest?from=${now}`,
		})
	
		return response.data.readings
	}
}

const client = connect('mqtt://nodered:1883')
const apiClient = new Api(process.env.GETFRESH_USERNAME || '', process.env.GETFRESH_PASSWORD || '')
apiClient.getLiveConsumption((consumption: PowerReading) => {
	client.publish('energy_meter', JSON.stringify(consumption))
})
