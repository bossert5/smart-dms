#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


BLANK_PAGE_RENDER_DPI = 72
BLANK_PAGE_MARGIN_RATIO = 0.01
BLANK_PAGE_BACKGROUND_PERCENTILE = 0.95
BLANK_PAGE_FOREGROUND_DELTA = 25
BLANK_PAGE_FOREGROUND_THRESHOLD_CEILING = 235
BLANK_PAGE_MIN_FOREGROUND_RATIO = 0.00035
BLANK_PAGE_MIN_COMPONENT_AREA = 12
BLANK_PAGE_LARGE_COMPONENT_AREA = 175
BLANK_PAGE_MIN_STRUCTURED_COMPONENTS = 4


def extract_pdf_text(args):
    from pdfminer.high_level import extract_text

    page_numbers = [0] if args.pages == "first" else None
    text = extract_text(args.input_pdf, page_numbers=page_numbers) or ""
    sys.stdout.write(text)


def count_pdf_pages(args):
    from pdfminer.pdfpage import PDFPage

    with open(args.input_pdf, "rb") as file:
        print(sum(1 for _ in PDFPage.get_pages(file)))


def extract_docling_markdown(args):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling_core.types.doc import ContentLayer, DocItemLabel

    started_at = time.monotonic()
    output_path = Path(args.output_markdown)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    debug_json_path = Path(args.output_json) if args.output_json else None
    if debug_json_path:
        debug_json_path.parent.mkdir(parents=True, exist_ok=True)

    pipeline_options = PdfPipelineOptions(
        enable_remote_services=False,
        artifacts_path=os.environ.get("DOCLING_ARTIFACTS_PATH") or None,
        document_timeout=args.timeout_seconds,
    )
    pipeline_options.do_ocr = False
    pipeline_options.do_table_structure = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    result = converter.convert(
        args.input_pdf,
        max_num_pages=args.max_pages,
        max_file_size=args.max_file_size,
    )
    markdown = (
        result.document.export_to_markdown(
            labels=set(DocItemLabel),
            included_content_layers={ContentLayer.BODY, ContentLayer.FURNITURE},
        )
        or ""
    )
    write_text_atomically(output_path, markdown)
    if debug_json_path:
        result.document.save_as_json(debug_json_path)

    print(
        json.dumps(
            {
                "markdownCharacters": len(markdown),
                "debugJson": bool(debug_json_path),
                "elapsedMs": round((time.monotonic() - started_at) * 1000),
            }
        )
    )


def write_text_atomically(path, content):
    temporary_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary_path.write_text(content, encoding="utf-8")
    os.replace(temporary_path, path)


def remove_blank_pdf_pages(args):
    import pikepdf

    total_pages = get_pdf_page_count(args.input_pdf)
    kept_pages = []
    removed_pages = []
    page_diagnostics = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        for page_index in range(total_pages):
            analysis = analyze_page_content(args.input_pdf, page_index, tmp_dir)
            page_diagnostics.append(analysis)
            if analysis["decision"] == "content":
                kept_pages.append(page_index + 1)
            else:
                removed_pages.append(page_index + 1)

    if kept_pages:
        if removed_pages:
            with pikepdf.open(args.input_pdf) as pdf:
                for page_index in reversed(range(total_pages)):
                    if page_index + 1 in removed_pages:
                        del pdf.pages[page_index]
                pdf.save(args.output_pdf)
        else:
            shutil.copyfile(args.input_pdf, args.output_pdf)

    print(
        json.dumps(
            {
                "totalPages": total_pages,
                "removedPages": removed_pages,
                "keptPages": kept_pages,
                "remainingPages": len(kept_pages),
                "pages": page_diagnostics,
            }
        )
    )


def rotate_pdf_pages(args):
    import pikepdf

    with pikepdf.open(args.input_pdf) as pdf:
        for page in pdf.pages:
            page.Rotate = (int(page.get("/Rotate", 0)) + args.degrees) % 360
        pdf.save(args.output_pdf)


def render_pdf_page_image(args):
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(args.input_pdf)
    page_index = args.page - 1
    if page_index < 0 or page_index >= len(document):
        raise ValueError(f"Page {args.page} is outside the PDF page range.")

    page = document[page_index]
    image = page.render(scale=args.dpi / 72).to_pil().convert("RGB")
    if args.crop_bottom_ratio:
        width, height = image.size
        crop_height = max(1, min(height, int(height * args.crop_bottom_ratio)))
        image = image.crop((0, height - crop_height, width, height))
    image.save(args.output_image, format="JPEG", quality=args.jpeg_quality)


def get_pdf_page_count(input_pdf):
    from pdfminer.pdfpage import PDFPage

    with open(input_pdf, "rb") as file:
        return sum(1 for _ in PDFPage.get_pages(file))


def analyze_page_content(input_pdf, page_index, tmp_dir):
    image_path = f"{tmp_dir}/page-{page_index + 1}.png"
    render_pdf_page(input_pdf, page_index + 1, image_path)
    image_analysis = analyze_page_image(image_path)
    has_visible_content = image_analysis_has_visible_content(image_analysis)

    return {
        "page": page_index + 1,
        "textLength": 0,
        "textTokenCount": 0,
        "hasMeaningfulText": False,
        **image_analysis,
        "decision": "content" if has_visible_content else "blank",
        "reason": image_content_reason(image_analysis)
        if has_visible_content
        else "low-foreground",
    }


def render_pdf_page(input_pdf, page_number, output_path):
    subprocess.run(
        [
            "gs",
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-sDEVICE=pnggray",
            f"-r{BLANK_PAGE_RENDER_DPI}",
            f"-dFirstPage={page_number}",
            f"-dLastPage={page_number}",
            f"-sOutputFile={output_path}",
            input_pdf,
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def analyze_page_image(image_path):
    from PIL import Image, ImageFilter

    with Image.open(image_path) as image:
        grayscale = crop_page_margin(image.convert("L"))
        denoised = grayscale.filter(ImageFilter.MedianFilter(size=3))
        pixels = list(denoised.getdata())

    total_pixels = len(pixels)
    background_value = percentile(pixels, BLANK_PAGE_BACKGROUND_PERCENTILE)
    foreground_threshold = min(
        BLANK_PAGE_FOREGROUND_THRESHOLD_CEILING,
        max(0, background_value - BLANK_PAGE_FOREGROUND_DELTA),
    )
    foreground_mask = [pixel <= foreground_threshold for pixel in pixels]
    width, height = denoised.size
    component_areas = connected_component_areas(
        foreground_mask,
        width,
        height,
        BLANK_PAGE_MIN_COMPONENT_AREA,
    )
    foreground_pixels = sum(component_areas)
    foreground_ratio = foreground_pixels / total_pixels if total_pixels else 0

    return {
        "backgroundValue": background_value,
        "foregroundThreshold": foreground_threshold,
        "foregroundRatio": round(foreground_ratio, 6),
        "foregroundPixels": foreground_pixels,
        "componentCount": len(component_areas),
        "largestComponentArea": max(component_areas, default=0),
    }


def crop_page_margin(image):
    width, height = image.size
    margin_x = int(width * BLANK_PAGE_MARGIN_RATIO)
    margin_y = int(height * BLANK_PAGE_MARGIN_RATIO)

    if margin_x <= 0 and margin_y <= 0:
        return image
    if width <= margin_x * 2 or height <= margin_y * 2:
        return image

    return image.crop((margin_x, margin_y, width - margin_x, height - margin_y))


def percentile(values, ratio):
    if not values:
        return 255

    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, int((len(sorted_values) - 1) * ratio)))
    return sorted_values[index]


def connected_component_areas(mask, width, height, min_area):
    visited = bytearray(len(mask))
    areas = []

    for start_index, is_foreground in enumerate(mask):
        if not is_foreground or visited[start_index]:
            continue

        area = 0
        stack = [start_index]
        visited[start_index] = 1

        while stack:
            index = stack.pop()
            area += 1
            x = index % width
            y = index // width

            for neighbor in foreground_neighbors(x, y, width, height):
                if mask[neighbor] and not visited[neighbor]:
                    visited[neighbor] = 1
                    stack.append(neighbor)

        if area >= min_area:
            areas.append(area)

    return areas


def foreground_neighbors(x, y, width, height):
    for offset_y in (-1, 0, 1):
        neighbor_y = y + offset_y
        if neighbor_y < 0 or neighbor_y >= height:
            continue

        for offset_x in (-1, 0, 1):
            if offset_x == 0 and offset_y == 0:
                continue

            neighbor_x = x + offset_x
            if neighbor_x < 0 or neighbor_x >= width:
                continue

            yield neighbor_y * width + neighbor_x


def image_analysis_has_visible_content(analysis):
    return (
        analysis["foregroundRatio"] >= BLANK_PAGE_MIN_FOREGROUND_RATIO
        or analysis["largestComponentArea"] >= BLANK_PAGE_LARGE_COMPONENT_AREA
        or analysis["componentCount"] >= BLANK_PAGE_MIN_STRUCTURED_COMPONENTS
    )


def image_content_reason(analysis):
    reasons = []
    if analysis["foregroundRatio"] >= BLANK_PAGE_MIN_FOREGROUND_RATIO:
        reasons.append("foreground-ratio")
    if analysis["largestComponentArea"] >= BLANK_PAGE_LARGE_COMPONENT_AREA:
        reasons.append("large-component")
    if analysis["componentCount"] >= BLANK_PAGE_MIN_STRUCTURED_COMPONENTS:
        reasons.append("structured-components")

    return "+".join(reasons)


def detect_language(args):
    from lingua import Language, LanguageDetectorBuilder

    language_map = {
        Language.GERMAN: "deu",
        Language.ENGLISH: "eng",
        Language.FRENCH: "fra",
        Language.SPANISH: "spa",
        Language.PORTUGUESE: "por",
        Language.CHINESE: "chi_sim",
    }
    with open(args.input_text, "r", encoding="utf-8", errors="ignore") as file:
        text = file.read()

    compact = "".join(text.split())
    if not compact:
        print(
            json.dumps(
                {
                    "language": None,
                    "tesseractLanguage": None,
                    "confidence": 0,
                    "margin": 0,
                }
            )
        )
        return

    detector = LanguageDetectorBuilder.from_languages(*language_map.keys()).build()
    values = detector.compute_language_confidence_values(text)
    if not values:
        print(
            json.dumps(
                {
                    "language": None,
                    "tesseractLanguage": None,
                    "confidence": 0,
                    "margin": 0,
                }
            )
        )
        return

    top = values[0]
    second_confidence = values[1].value if len(values) > 1 else 0
    print(
        json.dumps(
            {
                "language": top.language.name,
                "tesseractLanguage": language_map.get(top.language),
                "confidence": top.value,
                "margin": top.value - second_confidence,
            }
        )
    )


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser("extract-pdf-text")
    extract_parser.add_argument("--pages", choices=["first", "all"], required=True)
    extract_parser.add_argument("input_pdf")
    extract_parser.set_defaults(func=extract_pdf_text)

    count_parser = subparsers.add_parser("count-pdf-pages")
    count_parser.add_argument("input_pdf")
    count_parser.set_defaults(func=count_pdf_pages)

    docling_parser = subparsers.add_parser("extract-docling-markdown")
    docling_parser.add_argument("--max-pages", type=int, required=True)
    docling_parser.add_argument("--max-file-size", type=int, required=True)
    docling_parser.add_argument("--timeout-seconds", type=float, required=True)
    docling_parser.add_argument("--output-json")
    docling_parser.add_argument("input_pdf")
    docling_parser.add_argument("output_markdown")
    docling_parser.set_defaults(func=extract_docling_markdown)

    remove_blank_parser = subparsers.add_parser("remove-blank-pdf-pages")
    remove_blank_parser.add_argument("input_pdf")
    remove_blank_parser.add_argument("output_pdf")
    remove_blank_parser.set_defaults(func=remove_blank_pdf_pages)

    rotate_parser = subparsers.add_parser("rotate-pdf-pages")
    rotate_parser.add_argument("--degrees", type=int, choices=[180], required=True)
    rotate_parser.add_argument("input_pdf")
    rotate_parser.add_argument("output_pdf")
    rotate_parser.set_defaults(func=rotate_pdf_pages)

    render_parser = subparsers.add_parser("render-pdf-page")
    render_parser.add_argument("--page", type=int, required=True)
    render_parser.add_argument("--dpi", type=int, default=192)
    render_parser.add_argument("--jpeg-quality", type=int, default=88)
    render_parser.add_argument("--crop-bottom-ratio", type=float)
    render_parser.add_argument("input_pdf")
    render_parser.add_argument("output_image")
    render_parser.set_defaults(func=render_pdf_page_image)

    detect_parser = subparsers.add_parser("detect-language")
    detect_parser.add_argument("input_text")
    detect_parser.set_defaults(func=detect_language)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
