"""Build a small but genuinely valid two-page PDF for verification.

Hand-built rather than blank, so that when a human opens it in a browser there
is real text to confirm PDF.js rendered and the watermark sits over it.
"""
import sys


def content_stream(text, subtitle):
    return (
        "BT\n/F1 22 Tf\n72 700 Td\n(%s) Tj\nET\n"
        "BT\n/F1 12 Tf\n72 660 Td\n(%s) Tj\nET\n"
        "BT\n/F1 10 Tf\n72 630 Td"
        "\n(If you can read this line, PDF.js rendered the page.) Tj\nET\n"
        % (text, subtitle)
    )


def build(path):
    pages = [
        content_stream(
            "Cospire verification document",
            "Page 1 of 2 - uploaded by the Phase 1 documents verification run.",
        ),
        content_stream(
            "Second page",
            "Page 2 of 2 - present so multi-page rendering is exercised.",
        ),
    ]

    objects = {}
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
    objects[2] = "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>"
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    number = 4
    for stream in pages:
        objects[number] = (
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            "/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>"
            % (number + 1)
        )
        objects[number + 1] = "<< /Length %d >>\nstream\n%s\nendstream" % (
            len(stream),
            stream,
        )
        number += 2

    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num in sorted(objects):
        offsets[num] = len(out)
        out += ("%d 0 obj\n%s\nendobj\n" % (num, objects[num])).encode("latin-1")

    xref_at = len(out)
    count = max(objects) + 1
    out += ("xref\n0 %d\n" % count).encode("latin-1")
    out += b"0000000000 65535 f \n"
    for num in range(1, count):
        out += ("%010d 00000 n \n" % offsets[num]).encode("latin-1")
    out += (
        "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (count, xref_at)
    ).encode("latin-1")

    with open(path, "wb") as handle:
        handle.write(out)
    return len(out)


if __name__ == "__main__":
    size = build(sys.argv[1])
    print("wrote %s bytes" % size)
