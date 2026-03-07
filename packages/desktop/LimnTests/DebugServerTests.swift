// ABOUTME: XCTest suite for DebugServer HTTP request parsing and response formatting.
// ABOUTME: Tests the pure-function parts of the debug server without networking.

#if DEBUG

import XCTest
@testable import Limn

final class DebugServerTests: XCTestCase {

    // MARK: - Request parsing

    func testParseSimpleGet() {
        let raw = "GET /windows HTTP/1.1\r\nHost: localhost\r\n\r\n"
        let request = DebugServer.parseRequest(Data(raw.utf8))

        XCTAssertEqual(request.method, "GET")
        XCTAssertEqual(request.path, "/windows")
        XCTAssertTrue(request.query.isEmpty)
        XCTAssertTrue(request.body.isEmpty)
    }

    func testParseGetWithQueryParams() {
        let raw = "GET /eval?file=test.limn&window=2 HTTP/1.1\r\nHost: localhost\r\n\r\n"
        let request = DebugServer.parseRequest(Data(raw.utf8))

        XCTAssertEqual(request.method, "GET")
        XCTAssertEqual(request.path, "/eval")
        XCTAssertEqual(request.query["file"], "test.limn")
        XCTAssertEqual(request.query["window"], "2")
    }

    func testParsePostWithBody() {
        let raw = "POST /eval HTTP/1.1\r\nHost: localhost\r\nContent-Length: 3\r\n\r\n1+1"
        let request = DebugServer.parseRequest(Data(raw.utf8))

        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/eval")
        XCTAssertEqual(request.body, "1+1")
    }

    func testParsePostWithMultiLineBody() {
        let js = "var x = 1;\r\nvar y = 2;\r\nx + y"
        let raw = "POST /eval HTTP/1.1\r\nHost: localhost\r\n\r\n\(js)"
        let request = DebugServer.parseRequest(Data(raw.utf8))

        XCTAssertEqual(request.body, js)
    }

    func testParsePercentEncodedQuery() {
        let raw = "GET /eval?file=my%20file.limn HTTP/1.1\r\n\r\n"
        let request = DebugServer.parseRequest(Data(raw.utf8))

        XCTAssertEqual(request.query["file"], "my file.limn")
    }

    // MARK: - Response formatting

    func testFormatJSONResponse200() {
        let data = DebugServer.formatJSONResponse(["result": 42])
        let str = String(data: data, encoding: .utf8)!

        XCTAssertTrue(str.hasPrefix("HTTP/1.1 200 OK\r\n"))
        XCTAssertTrue(str.contains("Content-Type: application/json"))
        XCTAssertTrue(str.contains("\"result\":42"))
    }

    func testFormatJSONResponse404() {
        let data = DebugServer.formatJSONResponse(["error": "not found"], status: 404)
        let str = String(data: data, encoding: .utf8)!

        XCTAssertTrue(str.hasPrefix("HTTP/1.1 404 Not Found\r\n"))
        XCTAssertTrue(str.contains("\"error\":\"not found\""))
    }

    func testFormatJSONResponse400() {
        let data = DebugServer.formatJSONResponse(["error": "bad"], status: 400)
        let str = String(data: data, encoding: .utf8)!

        XCTAssertTrue(str.hasPrefix("HTTP/1.1 400 Bad Request\r\n"))
    }

    func testResponseContentLengthMatchesBody() {
        let dict: [String: Any] = ["result": "hello world"]
        let data = DebugServer.formatJSONResponse(dict)
        let str = String(data: data, encoding: .utf8)!

        // Extract Content-Length header value
        let lines = str.split(separator: "\r\n")
        let clLine = lines.first { $0.hasPrefix("Content-Length:") }!
        let clValue = Int(clLine.split(separator: " ")[1])!

        // Extract body (after double CRLF)
        let parts = str.split(separator: "\r\n\r\n", maxSplits: 1)
        let body = parts[1]
        XCTAssertEqual(clValue, body.utf8.count)
    }
}

#endif
