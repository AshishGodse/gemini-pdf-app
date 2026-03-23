Feature: PDF Accessibility Validator API

  Background:
    * url baseUrl = 'http://backend:5000'
    * header Content-Type = 'application/json'

  Scenario: Health check endpoint returns OK
    Given path '/health'
    When method get
    Then status 200
    And match response.status == 'ok'
    And match response.timestamp != null

  Scenario: Start a new scan job
    Given path '/api/scan/start'
    And request { filename: 'test.pdf', s3Path: 's3://pdf-bucket/test.pdf' }
    When method post
    Then status 201
    And match response.jobId != null
    And match response.status == 'pending'
    * def jobId = response.jobId

  Scenario: Get scan job status
    Given path '/api/scan/start'
    And request { filename: 'status-test.pdf', s3Path: 's3://pdf-bucket/status-test.pdf' }
    When method post
    Then status 201
    * def jobId = response.jobId

    Given path '/api/scan/' + jobId
    When method get
    Then status 200
    And match response.jobId == jobId
    And match response.status in ['pending', 'scanning', 'completed', 'failed']
    And match response.filename == 'status-test.pdf'

  Scenario: Get dashboard metrics
    Given path '/api/dashboard/metrics'
    When method get
    Then status 200
    And match response.summary != null
    And match response.summary.totalScanned >= 0
    And match response.summary.totalIssuesFound >= 0
    And match response.summary.totalIssuesFixed >= 0
    And match response.summary.complianceStatus != null
    And match response.trends != null

  Scenario: List all scan jobs
    Given path '/api/scan'
    When method get
    Then status 200
    And match response == '#[]'

  Scenario: Invalid jobId returns 404
    Given path '/api/scan/invalid-job-id-12345'
    When method get
    Then status 404
    And match response.error == 'Scan job not found'

  Scenario: Missing required parameters in scan start
    Given path '/api/scan/start'
    And request { filename: 'test.pdf' }
    When method post
    Then status 400
