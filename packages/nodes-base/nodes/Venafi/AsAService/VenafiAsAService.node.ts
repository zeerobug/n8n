import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	venafiApiRequest,
	venafiApiRequestAllItems,
} from './GenericFunctions';

import {
	certificateFields,
	certificateOperations,
} from './CertificateDescription';

import {
	certificateRequestFields,
	certificateRequestOperations,
} from './CertificateRequestDescription';

import {
	ICertficateRequest,
	ICsrAttributes,
	IKeyTypeParameters,
	ISubjectAltNamesByType,
} from './CertificateInterface';

export class VenafiAsAService implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Venafi As a Service',
		name: 'venafiAsAService',
		icon: 'file:../Tpp/venafi.png',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume Venafi As a Service API',
		defaults: {
			name: 'Venafi As a Service',
			color: '#000000',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'venafiAsAServiceApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Certificate',
						value: 'certificate',
					},
					{
						name: 'Certificate Request',
						value: 'certificateRequest',
					},
				],
				default: 'certificateRequest',
				description: 'The resource to operate on.',
			},
			...certificateOperations,
			...certificateFields,
			...certificateRequestOperations,
			...certificateRequestFields,
		],
	};

	methods = {
		loadOptions: {
			async getApplications(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const { applications } = await venafiApiRequest.call(this, 'GET', '/outagedetection/v1/applications');
				for (const application of applications) {
					returnData.push({
						name: application.name,
						value: application.id,
					});
				}
				return returnData;
			},
			async getApplicationServerTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const { applicationServerTypes } = await venafiApiRequest.call(this, 'GET', '/outagedetection/v1/applicationservertypes')
				for (const applicationServerType of applicationServerTypes) {
					returnData.push({
						name: applicationServerType.platformName,
						value: applicationServerType.id,
					});
				}
				return returnData;
			},
			async getCertificateIssuingTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const { certificateIssuingTemplates } = await venafiApiRequest.call(this, 'GET', '/v1/certificateissuingtemplates');
				for (const issueTemplate of certificateIssuingTemplates) {
					returnData.push({
						name: issueTemplate.name,
						value: issueTemplate.id,
					});
				}
				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		const length = items.length;
		const qs: IDataObject = {};
		let responseData;
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		for (let i = 0; i < length; i++) {

			try {

				if (resource === 'certificateRequest') {
					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificaterequests_create
					if (operation === 'create') {
						const applicationId = this.getNodeParameter('applicationId', i) as string;
						const certificateIssuingTemplateId = this.getNodeParameter('certificateIssuingTemplateId', i) as string;
						const options = this.getNodeParameter('options', i) as IDataObject;
						const generateCsr = this.getNodeParameter('generateCsr', i) as boolean;

						const body: ICertficateRequest = {
							applicationId: applicationId,
							certificateIssuingTemplateId: certificateIssuingTemplateId,
						};

						if (generateCsr) {
							const applicationServerTypeId = this.getNodeParameter('applicationServerTypeId', i) as string;
							const commonName = this.getNodeParameter('commonName', i) as string;
							const isVaaSGenerated = this.getNodeParameter('isVaaSGenerated', i) as boolean;
							const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

							const keyTypeDetails: IKeyTypeParameters = {};
							const csrAttributes: ICsrAttributes = {};
							const subjectAltNamesByType: ISubjectAltNamesByType = {};

							body.isVaaSGenerated = isVaaSGenerated as boolean;
							body.applicationServerTypeId = applicationServerTypeId as string;

							csrAttributes.commonName = commonName as string;

							// Csr Generation
							if (additionalFields.organization) {
								csrAttributes.organization = additionalFields.organization as string;
							}
							if (additionalFields.organizationalUnits) {
								csrAttributes.organizationalUnits = additionalFields.organizationalUnits as string[];
							}
							if (additionalFields.locality) {
								csrAttributes.locality = additionalFields.locality as string;
							}
							if (additionalFields.state) {
								csrAttributes.state = additionalFields.state as string;
							}
							if (additionalFields.country) {
								csrAttributes.country = additionalFields.country as string;
							}
							body.csrAttributes = csrAttributes;

							// Key type
							if (additionalFields.keyType) {
								keyTypeDetails.keyType = additionalFields.keyType as string;
							}
							if (additionalFields.keyCurve) {
								keyTypeDetails.keyCurve = additionalFields.keyCurve as string;
							}
							if (additionalFields.keyLength) {
								keyTypeDetails.keyLength = additionalFields.keyLength as number;
							}
							if (Object.keys(keyTypeDetails).length !== 0) {
								body.csrAttributes.keyTypeParameters = keyTypeDetails;
							}

							// SAN
							if (additionalFields.SubjectAltNamesUi) {
								for (const key of (additionalFields.SubjectAltNamesUi as IDataObject).SubjectAltNamesValues as IDataObject[]) {
									if (key.Typename === 'dnsNames') {
										subjectAltNamesByType.dnsNames ? subjectAltNamesByType.dnsNames.push(key.name as string) : subjectAltNamesByType.dnsNames = [key.name as string];
									}
									if (key.Typename === 'ipAddresses') {
										subjectAltNamesByType.ipAddresses ? subjectAltNamesByType.ipAddresses.push(key.name as string) : subjectAltNamesByType.ipAddresses = [key.name as string];
									}
									if (key.Typename === 'rfc822Names') {
										subjectAltNamesByType.rfc822Names ? subjectAltNamesByType.rfc822Names.push(key.name as string) : subjectAltNamesByType.rfc822Names = [key.name as string];
									}
									if (key.Typename === 'uniformResourceIdentifiers') {
										subjectAltNamesByType.uniformResourceIdentifiers ? subjectAltNamesByType.uniformResourceIdentifiers.push(key.name as string) : subjectAltNamesByType.uniformResourceIdentifiers = [key.name as string];
									}
								}
							}
							if (Object.keys(subjectAltNamesByType).length !== 0) {
								body.csrAttributes.subjectAlternativeNamesByType = subjectAltNamesByType;
							}
						} else {
							const certificateSigningRequest = this.getNodeParameter('certificateSigningRequest', i) as string;
							body.certificateSigningRequest = certificateSigningRequest;
						}

						Object.assign(body, options);

						responseData = await venafiApiRequest.call(
							this,
							'POST',
							`/outagedetection/v1/certificaterequests`,
							body,
							qs,
						);

						responseData = responseData.certificateRequests;
					}

					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificaterequests_getById
					if (operation === 'get') {
						const certificateId = this.getNodeParameter('certificateRequestId', i) as string;

						responseData = await venafiApiRequest.call(
							this,
							'GET',
							`/outagedetection/v1/certificaterequests/${certificateId}`,
							{},
							qs,
						);
					}

					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificaterequests_getAll
					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;

						if (returnAll) {

							responseData = await venafiApiRequestAllItems.call(
								this,
								'certificateRequests',
								'GET',
								`/outagedetection/v1/certificaterequests`,
								{},
								qs,
							);

						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							responseData = await venafiApiRequest.call(
								this,
								'GET',
								`/outagedetection/v1/certificaterequests`,
								{},
								qs,
							);

							responseData = responseData.certificateRequests.splice(0, limit);
						}
					}
				}

				if (resource === 'certificate') {
					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificateretirement_deleteCertificates
					if (operation === 'delete') {
						const certificateId = this.getNodeParameter('certificateId', i) as string;

						responseData = await venafiApiRequest.call(
							this,
							'POST',
							`/outagedetection/v1/certificates/deletion`,
							{ certificateIds: [certificateId] },
						);

						responseData = responseData.certificates;
					}

					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/
					if (operation === 'download') {
						const certificateId = this.getNodeParameter('certificateId', i) as string;
						const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
						const options = this.getNodeParameter('options', i) as IDataObject;

						Object.assign(qs, options);

						responseData = await venafiApiRequest.call(
							this,
							'GET',
							`/outagedetection/v1/certificates/${certificateId}/contents`,
							{},
							qs,
						);

						const binaryData = await this.helpers.prepareBinaryData(Buffer.from(responseData));

						responseData = {
							json: {},
							binary: {
								[binaryProperty]: binaryData,
							},
						};
					}

					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificates_getById
					if (operation === 'get') {
						const certificateId = this.getNodeParameter('certificateId', i) as string;

						responseData = await venafiApiRequest.call(
							this,
							'GET',
							`/outagedetection/v1/certificates/${certificateId}`,
							{},
							qs,
						);
					}

					//https://api.venafi.cloud/webjars/swagger-ui/index.html?configUrl=%2Fv3%2Fapi-docs%2Fswagger-config&urls.primaryName=outagedetection-service#/%2Fv1/certificates_getAllAsCsv
					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i) as IDataObject;

						Object.assign(qs, filters);

						if (returnAll) {

							responseData = await venafiApiRequestAllItems.call(
								this,
								'certificates',
								'GET',
								`/outagedetection/v1/certificates`,
								{},
								qs,
							);

						} else {
							qs.limit = this.getNodeParameter('limit', i) as number;
							responseData = await venafiApiRequest.call(
								this,
								'GET',
								`/outagedetection/v1/certificates`,
								{},
								qs,
							);

							responseData = responseData.certificates;
						}
					}

					//https://docs.venafi.cloud/api/t-cloud-api-renew-cert/
					if (operation === 'renew') {

						/*
						 TODO
						 Only ask for Certificate ID and Certificate Signing Request.
						 Request other information by doing a get HTTP request
						 */

						const applicationId = this.getNodeParameter('applicationId', i) as string;
						const certificateIssuingTemplateId = this.getNodeParameter('certificateIssuingTemplateId', i) as string;
						const certificateSigningRequest = this.getNodeParameter('certificateSigningRequest', i) as string;
						const existingCertificateId = this.getNodeParameter('existingCertificateId', i) as string;
						const options = this.getNodeParameter('options', i) as IDataObject;

						const body: IDataObject = {
							certificateSigningRequest,
							certificateIssuingTemplateId,
							applicationId,
							existingCertificateId,
						};

						Object.assign(body, options);

						responseData = await venafiApiRequest.call(
							this,
							'POST',
							`/outagedetection/v1/certificaterequests`,
							body,
							qs,
						);

						responseData = responseData.certificateRequests;
					}
				}

				if (Array.isArray(responseData)) {
					returnData.push.apply(returnData, responseData as IDataObject[]);
				} else if (responseData !== undefined) {
					returnData.push(responseData as IDataObject);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}

		if (operation === 'download') {
			return this.prepareOutputData(returnData as unknown as INodeExecutionData[]);
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
