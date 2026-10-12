"""Regression tests for the histology media importer (stdlib unittest only)."""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("import_histology_media.py")
SPEC = importlib.util.spec_from_file_location("histology_media_importer", SCRIPT)
assert SPEC and SPEC.loader
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class HistologyMediaImporterTests(unittest.TestCase):
    def test_decodes_legacy_cyrillic_paths(self):
        self.assertEqual(
            IMPORTER.decode_legacy_path("content/histology/5_#U0424#U043e#U0442.jpg"),
            "content/histology/5_Фот.jpg",
        )

    def test_accepts_uploaded_content_zip_photo_path(self):
        target = IMPORTER.media_target(
            "content/histology/5_Фотографии препаратов/частная гистология/Почка.jpg"
        )
        self.assertEqual(
            target.as_posix(),
            "histology/5_Фотографии препаратов/частная гистология/Почка.jpg",
        )

    def test_accepts_legacy_features_zip_photo_path(self):
        target = IMPORTER.media_target(
            "features/histology-content/photos/5_Фотографии препаратов/Почка.jpg"
        )
        self.assertEqual(target.as_posix(), "histology/5_Фотографии препаратов/Почка.jpg")

    def test_rejects_path_traversal(self):
        self.assertIsNone(
            IMPORTER.media_target("content/histology/5_Фотографии препаратов/../../secrets.jpg")
        )

    def test_extracts_media_metadata_and_em_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "content.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr(
                    "content/histology/5_Фотографии препаратов/раздел/Почка.jpg",
                    b"photo-bytes",
                )
                archive.writestr(
                    "content/histology/electronograms/images/mitohondrii.png",
                    b"em-bytes",
                )
                archive.writestr(
                    "content/histology/em/mitohondrii.png",
                    b"em-bytes",
                )
                archive.writestr(
                    "content/histology/electronograms/docx-captions.json",
                    '{"Митохондрии":{"captions":["Криста"]}}',
                )
            out = root / "backend" / "content"
            counts = IMPORTER.extract_media(source, out)
            self.assertEqual((out / "histology/5_Фотографии препаратов/раздел/Почка.jpg").read_bytes(), b"photo-bytes")
            self.assertEqual((out / "histology/electronograms/images/mitohondrii.png").read_bytes(), b"em-bytes")
            self.assertEqual((out / "histology/em/mitohondrii.png").read_bytes(), b"em-bytes")
            self.assertTrue((out / "histology/docx-captions.json").exists())
            self.assertTrue((out / "histology/histology-media-manifest.json").exists())
            self.assertGreaterEqual(counts["duplicates"], 1)

    def test_conflicting_normalized_paths_fail_instead_of_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "conflict.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("content/histology/5_Фотографии препаратов/Почка.jpg", b"one")
                archive.writestr("content/histology/5_#U0424#U043e#U0442ографии препаратов/Почка.jpg", b"two")
            with self.assertRaises(ValueError):
                IMPORTER.extract_media(source, root / "out")


if __name__ == "__main__":
    unittest.main()
