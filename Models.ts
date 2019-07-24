export interface LoginResponse {
	access_token: string;
	expires_in: number; // probably milliseconds ~10min
	jti: string;
	meters: Array<string>;
	refresh_token: string;
	scope: "read write" | string;
	token_type: "bearer" | string;
	userId: number;
}

export interface UserInfo {
	bills: Array<any>;
	email: string;
	firstName: string;
	id: number | string;
	lastName: string;
	partnerId: "fresh";
	phone: null;
	salutation: "Herr" | string;
	services: [];
	smartMeters: Array<SmartMeter>;
	title: null;
}

export interface Price {
	value: number;
	currency: 'EUR' | string;
}

export interface SmartMeter {
	deinstallationDate: null;
	installationDate: null | string; // "2018-07-12"
	meterId: string;
	meterType: null;
	operatorId: string;
	owner: {
		partnerId: "fresh" | string;
		id: string;
	};
	phaseType: null;
	readingFrequency: null;
	tariffs: Array<{
		validFrom: string; // "2019-01-01" 
		validUntil: string; // "2030-01-01"
		kwhUnitGrossPrice: Price;
		dailyBaseGrossPrice: Price;
	}>;
}

export interface PowerReading {
	dateTime: string; // "2019-07-24T15:30:01Z"
	energyReading: number; // 3783.3324891
	power: number; // 243.32
	powerPhase1: number; // 25.77
	powerPhase2: number; // 70.8
	powerPhase3: number; // 146.75
}

export type HeaderDict = {
	[s: string]: string;
};
