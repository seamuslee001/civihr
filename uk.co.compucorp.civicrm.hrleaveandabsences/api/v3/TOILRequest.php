<?php

/**
 * TOILRequest.create API specification (optional)
 * This is used for documentation and validation.
 *
 * @param array $spec description of fields supported by this API call
 * @return void
 * @see http://wiki.civicrm.org/confluence/display/CRMDOC/API+Architecture+Standards
 */
function _civicrm_api3_t_o_i_l_request_create_spec(&$spec) {
  // $spec['some_parameter']['api.required'] = 1;
}

/**
 * TOILRequest.create API
 *
 * @param array $params
 * @return array API result descriptor
 * @throws API_Exception
 */
function civicrm_api3_t_o_i_l_request_create($params) {
  return _civicrm_api3_basic_create(_civicrm_api3_get_BAO(__FUNCTION__), $params);
}

/**
 * TOILRequest.delete API
 *
 * @param array $params
 * @return array API result descriptor
 * @throws API_Exception
 */
function civicrm_api3_t_o_i_l_request_delete($params) {
  return _civicrm_api3_basic_delete(_civicrm_api3_get_BAO(__FUNCTION__), $params);
}

/**
 * TOILRequest.get API
 *
 * @param array $params
 * @return array API result descriptor
 * @throws API_Exception
 */
function civicrm_api3_t_o_i_l_request_get($params) {
  return _civicrm_api3_basic_get(_civicrm_api3_get_BAO(__FUNCTION__), $params);
}

/**
 * TOILRequest.isValid API
 * This API runs the validation on the TOILRequest BAO create method
 * without a call to the TOILRequest create itself.
 *
 * @param array $params
 *  An array of params passed to the API
 *
 * @return array
 */
function civicrm_api3_t_o_i_l_request_isvalid($params) {
  $result = [];

  try {
    CRM_HRLeaveAndAbsences_BAO_TOILRequest::validateParams($params);
  }
  catch (CRM_HRLeaveAndAbsences_Exception_InvalidTOILRequestException $e) {
    $result[$e->getField()] = [$e->getExceptionCode()];
  }

  return civicrm_api3_create_success($result);
}