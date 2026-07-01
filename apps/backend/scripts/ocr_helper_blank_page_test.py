import importlib.util
import pathlib
import unittest


HELPER_PATH = pathlib.Path(__file__).with_name("ocr-helper.py")
SPEC = importlib.util.spec_from_file_location("ocr_helper", HELPER_PATH)
ocr_helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ocr_helper)


class BlankPageAnalysisTest(unittest.TestCase):
    def test_blank_page_detection_is_visual_only(self):
        original_render_pdf_page = ocr_helper.render_pdf_page
        original_analyze_page_image = ocr_helper.analyze_page_image
        ocr_helper.render_pdf_page = lambda input_pdf, page_number, output_path: None
        ocr_helper.analyze_page_image = lambda image_path: {
            "backgroundValue": 255,
            "foregroundThreshold": 230,
            "foregroundRatio": 0,
            "foregroundPixels": 0,
            "componentCount": 0,
            "largestComponentArea": 0,
        }

        try:
            analysis = ocr_helper.analyze_page_content("ignored.pdf", 0, ".")
        finally:
            ocr_helper.render_pdf_page = original_render_pdf_page
            ocr_helper.analyze_page_image = original_analyze_page_image

        self.assertEqual(analysis["decision"], "blank")
        self.assertEqual(analysis["reason"], "low-foreground")
        self.assertFalse(analysis["hasMeaningfulText"])

    def test_few_gray_speckles_are_blank(self):
        self.assertFalse(
            ocr_helper.image_analysis_has_visible_content(
                {
                    "foregroundRatio": 0.00002,
                    "largestComponentArea": 8,
                    "componentCount": 2,
                }
            )
        )

    def test_scanner_edge_only_is_blank_after_margin_crop(self):
        self.assertFalse(
            ocr_helper.image_analysis_has_visible_content(
                {
                    "foregroundRatio": 0,
                    "largestComponentArea": 0,
                    "componentCount": 0,
                }
            )
        )

    def test_text_like_foreground_keeps_page(self):
        self.assertTrue(
            ocr_helper.image_analysis_has_visible_content(
                {
                    "foregroundRatio": 0.0004,
                    "largestComponentArea": 60,
                    "componentCount": 12,
                }
            )
        )

    def test_large_stamp_or_mark_keeps_page(self):
        self.assertTrue(
            ocr_helper.image_analysis_has_visible_content(
                {
                    "foregroundRatio": 0.0001,
                    "largestComponentArea": 220,
                    "componentCount": 1,
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
