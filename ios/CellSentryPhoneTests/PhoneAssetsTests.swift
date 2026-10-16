import XCTest
@testable import CellSentryPhone

final class PhoneAssetsTests: XCTestCase {
    func testPromptParityWithDesktop() throws {
        for sample in try PhoneAssets.samples() {
            XCTAssertEqual(try PhoneAssets.userPrompt(sample.issue), sample.expectedPrompt)
            let wrapped = try PhoneAssets.wrappedPrompt(sample.issue)
            XCTAssertTrue(wrapped.hasPrefix("<s><|im_start|>system\n"))
            XCTAssertTrue(wrapped.hasSuffix("<think>\n\n</think>\n\n"))
        }
    }
    func testInvalidIdentityAndTruncationDoNotWithdrawFinding() throws {
        let issue = try XCTUnwrap(PhoneAssets.samples().first).issue
        let wrong = "[{\"cellAddress\":\"WRONG\",\"ruleId\":\"\(issue.ruleId)\",\"isValid\":false,\"adjustedConfidence\":0.9,\"reasoning\":\"x\"}]"
        XCTAssertThrowsError(try PhoneAssets.validate(wrong, issue: issue, finishReason: "stop"))
        XCTAssertThrowsError(try PhoneAssets.validate("[]", issue: issue, finishReason: "length"))
    }
    func testManifestMatchesDesktopModel() throws {
        let manifest = try PhoneAssets.manifest()
        XCTAssertEqual(manifest.bytes, 1_561_314_592)
        XCTAssertEqual(manifest.sha256, "61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a")
        XCTAssertEqual(manifest.context, 1024)
    }
}
