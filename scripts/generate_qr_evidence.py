#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import qrcode
from qrcode.image.svg import SvgPathImage


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--png", required=True)
    parser.add_argument("--svg", required=True)
    args = parser.parse_args()

    png = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
    png.add_data(args.url)
    png.make(fit=True)
    png.make_image(fill_color="black", back_color="white").save(args.png)

    svg = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=4)
    svg.add_data(args.url)
    svg.make(fit=True)
    svg.make_image(image_factory=SvgPathImage).save(args.svg)

    Path(args.png).stat()
    Path(args.svg).stat()
    print(f"QR_GENERATED: {args.url}")


if __name__ == "__main__":
    main()
