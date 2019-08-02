import axios, { AxiosInstance } from 'axios'
import { LoginResponse, UserInfo, PowerReading, SmartMeter } from './Models'
import { ReadingsMonitor, ReadingCallback } from './ReadingsMonitor'
import * as qs from 'qs'
import * as moment from 'moment'

export class GetFreshEnergyApiClient {
  private expiration: number = 0
  private loginResponse?: LoginResponse
  private sessionRenewalPromise?: Promise<void>

  constructor(private username: string, private password: string, private partner: 'fresh' | string) {}

  public createMonitor(meter: SmartMeter, callback: ReadingCallback) {
    return new ReadingsMonitor(this, meter, callback)
  }

  private setLoginExpired() {
    this.expiration = 0
  }

  private async getValidApiSession(options?: { forLogin?: boolean }): Promise<AxiosInstance> {
    const clientForLogin = options && options.forLogin
    if (!clientForLogin) {
      await this.ensureSessionIsNotExpired()
    }

    const authenticationHeader =
      !clientForLogin && this.loginResponse
        ? {
            Authorization: 'Bearer ' + (this.loginResponse ? this.loginResponse!.access_token : ''),
            Cookie: 'auth=' + qs.stringify(this.loginResponse) + ';' + ' user-has-accepted-cookies=true;',
          }
        : {}

    return axios.create({
      baseURL: 'https://app.getfresh.energy/',
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...authenticationHeader,
      },
      validateStatus: status => {
        if (status === 401) {
          this.setLoginExpired()
        }
        return status >= 200 && status < 300 // default
      },
    })
  }

  private async ensureSessionIsNotExpired() {
    if (this.sessionRenewalPromise) {
      return this.sessionRenewalPromise
    }

    if (this.expiration < Date.now()) {
      console.log('Refresh session')
      try {
        this.sessionRenewalPromise = this.login()
        await this.sessionRenewalPromise
      } catch (error) {
        console.error(error)
        throw new Error('Could not refresh session')
      }
    }
  }

  private async login(): Promise<void> {
    this.loginResponse = undefined
    const credentials = qs.stringify({
      grant_type: 'password',
      partner: this.partner,
      password: this.password,
      username: this.username,
    })

    const optionsFormUrlEncoded = {
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
      },
    }

    const apiClient = await this.getValidApiSession({ forLogin: true })
    const response = await apiClient.post('auth/oauth/token', credentials, optionsFormUrlEncoded)
    this.loginResponse = response.data
    this.expiration = this.loginResponse ? Date.now() + this.loginResponse.expires_in : 0
  }

  async getUserInfo(): Promise<UserInfo | undefined> {
    await this.ensureSessionIsNotExpired()
    if (!this.loginResponse) {
      return
    }
    const userId = this.loginResponse.userId
    try {
      const apiClient = await this.getValidApiSession()
      const response = await apiClient.get(`user-management/users/${userId}`)
      return response.data
    } catch (error) {
      throw new Error('Could not load user info')
    }
  }

  async getPowerReadings(meterId: string): Promise<Array<PowerReading>> {
    let now = moment
      .utc()
      .subtract('5', 'seconds')
      .format()
      .replace('Z', '.000Z')
    const apiClient = await this.getValidApiSession()
    const response = await apiClient.get(`readings/meters/${meterId}/latest?from=${now}`)
    return response.data.readings
  }
}
