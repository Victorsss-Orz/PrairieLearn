import os
from collections.abc import Generator, Iterable, Iterator
from functools import cache
from html import escape, unescape
from textwrap import dedent
from typing import Any

import chevron
import lxml.html
import prairielearn as pl
import pygments
import pygments.formatters
import pygments.lexer
import pygments.lexers
import pygments.style
import pygments.util
from pygments.styles import STYLE_MAP, get_style_by_name
from pygments.token import Token, _TokenType
from pygments_ansi_color import color_tokens

LANGUAGE_DEFAULT = None
STYLE_NAME_DEFAULT = "friendly"
NO_HIGHLIGHT_DEFAULT = False
SOURCE_FILE_NAME_DEFAULT = None
PREVENT_SELECT_DEFAULT = False
HIGHLIGHT_LINES_DEFAULT = None
HIGHLIGHT_LINES_COLOR_DEFAULT = None
DIRECTORY_DEFAULT = "."
COPY_CODE_BUTTON_DEFAULT = False
SHOW_LINE_NUMBERS_DEFAULT = False
NORMALIZE_WHITESPACE_DEFAULT = False

# These are the same colors used in pl-external-grader-result
ANSI_COLORS = {
    "Black": "#000000",
    "Red": "#c91b00",
    "Green": "#00c200",
    "Yellow": "#c7c400",
    "Blue": "#0037da",
    "Magenta": "#c930c7",
    "Cyan": "#00c5c7",
    "White": "#c7c7c7",
    "BrightBlack": "#676767",
    "BrightRed": "#ff6d67",
    "BrightGreen": "#5ff967",
    "BrightYellow": "#fefb67",
    "BrightBlue": "#6871ff",
    "BrightMagenta": "#ff76ff",
    "BrightCyan": "#5ffdff",
    "BrightWhite": "#feffff",
}


def parse_highlight_lines(highlight_lines: str) -> list[int] | None:
    """
    Parse a string like "1", "1-4", "1-3,5,7-8" into a list of lines like
    [1], [1,2,3,4], and [1,2,3,5,7,8]
    """
    lines = []
    components = highlight_lines.split(",")
    for raw_component in components:
        component = raw_component.replace(" ", "").split("-")
        try:
            if len(component) == 1:
                line = int(component[0])
                lines.append(line)
            # Try parsing as "##-###"
            elif len(component) == 2:
                start = int(component[0])
                end = int(component[1])
                lines.extend(range(start, end + 1))
            else:
                return None
        except ValueError:
            return None

    return lines


class NoHighlightingLexer(pygments.lexer.Lexer):
    """
    Dummy lexer for when syntax highlighting is not wanted, but we still
    want to run it through the highlighter for styling and code escaping.
    """

    def __init__(self, **options: Any) -> None:
        pygments.lexer.Lexer.__init__(self, **options)
        self.compress = options.get("compress", "")

    def get_tokens_unprocessed(
        self, text: str
    ) -> Iterator[tuple[int, _TokenType, str]]:
        return iter([(0, Token.Text, text)])


class HighlightingHtmlFormatter(pygments.formatters.HtmlFormatter[str]):
    """
    Subclass of the default HTML formatter to provide more flexibility
    with highlighted lines.
    """

    def set_highlighted_lines(self, hl_lines: list[int] | None) -> None:
        self.hl_lines.clear()
        if hl_lines:
            for line in hl_lines:
                self.hl_lines.add(line)

    def _highlight_lines(
        self, tokensource: Iterable[tuple[int, str]]
    ) -> Generator[tuple[int, str], None, None]:
        """
        Highlighted the lines specified in the `hl_lines` option by post-processing the token stream.
        Based on the code at "https://github.com/pygments/pygments/blob/master/pygments/formatters/html.py#L816"
        """
        for i, (t, value) in enumerate(tokensource):
            if t != 1:
                yield t, value
            if i + 1 in self.hl_lines:  # i + 1 because Python indexes start at 0
                yield (
                    1,
                    f'<span class="pl-code-highlighted-line" style="background-color: {self.style.highlight_color}">{value}</span>',
                )
            else:
                yield 1, value

    @property
    def _linenos_style(self) -> str:
        # All styling will be handled in CSS.
        return ""


# Selecting and instantiating a lexer is actually reasonably expensive
# (on the order of 5-10ms). We cache a resolution from a language name to a
# lexers to avoid this cost if `<pl-code>` is used with the same language
# multiple times in the same question.
@cache
def get_lexer_by_name(name: str) -> pygments.lexer.Lexer | None:
    """
    Find a lexer by both its proper name and any aliases it has.
    Returns None if no lexer is found.
    """
    # Search by proper class/language names
    # This returns None if not found, and a class if found.
    lexer_class = pygments.lexers.find_lexer_class(name)
    if lexer_class is not None:
        # Instantiate the class if we found it
        return lexer_class()
    else:
        try:
            # Search by language aliases
            # This throws an Exception if it's not found, and returns an instance if found.
            return pygments.lexers.get_lexer_by_name(name)
        except pygments.util.ClassNotFound:
            return None


# Computing this is relatively expensive, so we'll do it once here and reuse it.
@cache
def get_ansi_color_tokens() -> dict[_TokenType, str]:
    return color_tokens(ANSI_COLORS, ANSI_COLORS)


# Instantiating a style/formatter is also expensive, so we'll cache it as well.
# Note that sharing an instance means we'll also share the `hl_lines` instance
# member, so the caller must take care to set or clear it as needed before use.
@cache
def get_formatter(
    BaseStyle: type[pygments.style.Style], highlight_lines_color: str | None
) -> HighlightingHtmlFormatter:
    class CustomStyleWithAnsiColors(BaseStyle):
        # pygments did not annotate their class variables correctly (https://github.com/pygments/pygments/pull/2838)
        styles = {**BaseStyle.styles, **get_ansi_color_tokens()}  # noqa: RUF012

        highlight_color = (
            highlight_lines_color or BaseStyle.highlight_color or "#b3d7ff"
        )

    return HighlightingHtmlFormatter(
        style=CustomStyleWithAnsiColors,
        nobackground=True,
        noclasses=True,
        # We'll unconditionally render the line numbers, but we'll hide them if
        # they aren't specifically enabled. This means we only have to deal with
        # one markup "shape" in our CSS, not two.
        linenos="table",
    )


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = [
        "language",
        "no-highlight",  # Deprecated, accepted for backwards compatibility
        "source-file-name",
        "directory",
        "prevent-select",
        "highlight-lines",
        "highlight-lines-color",
        "copy-code-button",
        "style",
        "style-name",
        "show-line-numbers",
        "normalize-whitespace",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    language = pl.get_string_attrib(element, "language", LANGUAGE_DEFAULT)
    if language is not None:
        lexer = get_lexer_by_name(language)
        if lexer is None:
            raise KeyError(
                f'Unknown language: "{language}". Must be one of the aliases listed in https://pygments.org/languages/, or the special language "ansi-color".'
            )

    # The `style` attribute is deprecated, but we still support it for backwards compatibility.
    if pl.has_attrib(element, "style") and pl.has_attrib(element, "style-name"):
        raise ValueError(
            'Cannot use both "style" and "style-name" attributes at the same time.'
        )
    style_name = pl.get_string_attrib(
        element,
        "style-name",
        pl.get_string_attrib(element, "style", STYLE_NAME_DEFAULT),
    )
    allowed_styles = STYLE_MAP.keys()
    if style_name not in allowed_styles:
        raise KeyError(
            f'Unknown style name: "{style_name}". Must be one of {", ".join(allowed_styles)}'
        )

    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )
    if (
        source_file_name is not None
        and element.text is not None
        and not str(element.text).isspace()
    ):
        raise ValueError(
            'Existing code cannot be added inside html element when "source-file-name" attribute is used.'
        )

    highlight_lines = pl.get_string_attrib(
        element, "highlight-lines", HIGHLIGHT_LINES_DEFAULT
    )
    if highlight_lines is not None and parse_highlight_lines(highlight_lines) is None:
        raise ValueError("Could not parse highlight-lines attribute; check your syntax")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, "language", LANGUAGE_DEFAULT)
    style_name = pl.get_string_attrib(
        element,
        "style-name",
        pl.get_string_attrib(element, "style", STYLE_NAME_DEFAULT),
    )
    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )
    directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)
    prevent_select = pl.get_boolean_attrib(
        element, "prevent-select", PREVENT_SELECT_DEFAULT
    )
    highlight_lines = pl.get_string_attrib(
        element, "highlight-lines", HIGHLIGHT_LINES_DEFAULT
    )
    highlight_lines_color = pl.get_color_attrib(
        element, "highlight-lines-color", HIGHLIGHT_LINES_COLOR_DEFAULT
    )

    show_line_numbers = pl.get_boolean_attrib(
        element, "show-line-numbers", SHOW_LINE_NUMBERS_DEFAULT
    )

    normalize_whitespace = pl.get_boolean_attrib(
        element, "normalize-whitespace", NORMALIZE_WHITESPACE_DEFAULT
    )

    # The no-highlight option is deprecated, but supported for backwards compatibility
    if pl.get_boolean_attrib(element, "no-highlight", NO_HIGHLIGHT_DEFAULT):
        language = None

    if source_file_name is not None:
        if directory == "serverFilesCourse":
            base_path = data["options"]["server_files_course_path"]
        elif directory == "clientFilesCourse":
            base_path = data["options"]["client_files_course_path"]
        else:
            base_path = os.path.join(data["options"]["question_path"], directory)
        file_path = os.path.join(base_path, source_file_name)
        if not os.path.exists(file_path):
            raise ValueError(f'Unknown file path: "{file_path}".')

        with open(file_path) as f:
            code = f.read().removesuffix("\n").removesuffix("\r")

        # Automatically escape code in file source (important for: html/xml).
        code = escape(code)
    else:
        # Strip a single leading newline from the code, if present. This
        # avoids having spurious newlines because of HTML like:
        #
        # <pl-code>
        # some_code
        # </pl-code>
        #
        # which technically starts with a newline, but we probably
        # don't want a blank line at the start of the code block.
        code = pl.inner_html(element).removeprefix("\r").removeprefix("\n")

    if normalize_whitespace:
        code = dedent(code).rstrip()

    lexer = NoHighlightingLexer() if language is None else get_lexer_by_name(language)

    pygments_style = get_style_by_name(style_name)

    background_color = pygments_style.background_color or "transparent"
    line_number_color = pygments_style.line_number_color

    formatter = get_formatter(pygments_style, highlight_lines_color)
    formatter.set_highlighted_lines(
        parse_highlight_lines(highlight_lines) if highlight_lines else None
    )

    code = pygments.highlight(unescape(code), lexer, formatter)

    html_params = {
        "uuid": pl.get_uuid(),
        "code": code,
        "prevent_select": prevent_select,
        "background_color": background_color,
        "line_number_color": line_number_color,
        "show_line_numbers": show_line_numbers,
        "copy_code_button": pl.get_boolean_attrib(
            element, "copy-code-button", COPY_CODE_BUTTON_DEFAULT
        ),
    }

    with open("pl-code.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
