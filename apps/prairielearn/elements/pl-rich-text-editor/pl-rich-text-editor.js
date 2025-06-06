/* global Quill, he, MathJax, QuillMarkdown, DOMPurify, bootstrap */

(() => {
  const rtePurify = DOMPurify();
  const rtePurifyConfig = { SANITIZE_NAMED_PROPS: true };

  rtePurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'span' && node.classList.contains('ql-formula')) {
      // Quill formulas don't need their SVG content in the sanitized version,
      // as they are re-rendered upon loading.
      node.innerText = `$${node.dataset.value}$`;
    }
  });

  class Counter {
    constructor(unit, uuid, getText) {
      this.unit = unit;
      this.container = document.getElementById(`rte-counter-${uuid}`);
      this.getText = getText;

      // Eagerly populate the container
      this.update();
    }

    calculate(text) {
      if (this.unit === 'word') {
        const trimmed = text.trim();
        // Splitting empty text returns a non-empty array
        return trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
      } else if (this.unit === 'character') {
        // Use a spread so that Unicode characters are counted instead of utf-16 code units
        return [...text].length;
      } else {
        console.error(`Text count not implemented for unit type: ${this.unit}`);
      }
    }

    update() {
      const length = this.calculate(this.getText());
      const label = `${this.unit}${length === 1 ? '' : 's'}`;
      this.container.innerText = `${length} ${label}`;
    }
  }

  const Clipboard = Quill.import('modules/clipboard');
  class PotentiallyDisabledClipboard extends Clipboard {
    onCaptureCopy(e, isCut = false) {
      if (this.options.enabled ?? true) return super.onCaptureCopy(e, isCut);
      if (!e.defaultPrevented) e.preventDefault();
      this.showToast();
    }

    onCapturePaste(e) {
      if (this.options.enabled ?? true) return super.onCapturePaste(e);
      if (!e.defaultPrevented) e.preventDefault();
      this.showToast();
    }

    showToast() {
      if (!this.toast) {
        const toastElement = document.getElementById(this.options.toast_id);
        this.toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 2000 });
      }
      this.toast.show();
    }
  }

  Quill.register('modules/clipboard', PotentiallyDisabledClipboard, true);

  window.PLRTE = async function (uuid) {
    const baseElement = document.getElementById(`rte-${uuid}`);
    const options = JSON.parse(baseElement.dataset.options);

    if (!options.modules) options.modules = {};
    if (!options.modules.clipboard) options.modules.clipboard = {};
    options.modules.clipboard.toast_id = 'rte-clipboard-toast-' + uuid;
    if (options.readOnly) {
      options.modules.toolbar = false;
    } else {
      options.modules.toolbar = [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block', { script: 'sub' }, { script: 'super' }, 'formula'],
        [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
        [{ size: ['small', false, 'large'] }],
        [{ header: [1, 2, 3, false] }],
        [{ color: [] }, { background: [] }],
        ['clean'],
      ];
    }

    options.modules.keyboard = {
      bindings: {
        tab: {
          key: 9,
          handler: () => {
            // Overrides Quill tab behavior that inserts a tab character.
            // Retains other Quill tab behaviours (indent list items or code
            // blocks, switch cells in table), falling back to the browser's
            // default behavior (focus on next focusable element) for
            // accessibility.
            // https://quilljs.com/docs/modules/keyboard#configuration
            return true;
          },
        },
      },
    };

    // Set the bounds for UI elements (e.g., the tooltip for the formula editor)
    // to the question container.
    // https://quilljs.com/docs/configuration#bounds
    options.bounds = baseElement.closest('.question-container');

    const inputElement = $('#rte-input-' + uuid);
    const quill = new Quill(baseElement, options);

    if (options.markdownShortcuts && !options.readOnly) new QuillMarkdown(quill, {});

    let contents = atob(inputElement.val());
    if (contents && options.format === 'markdown') {
      const marked = (await import('marked')).marked;
      contents = marked.parse(contents);
    }
    contents = rtePurify.sanitize(contents, rtePurifyConfig);

    quill.setContents(quill.clipboard.convert({ html: contents }));

    const getText = () => quill.getText();
    const counter = options.counter === 'none' ? null : new Counter(options.counter, uuid, getText);

    const updateHiddenInput = function () {
      // If a user types something and erases it, the editor will be blank, but
      // the content will be something like `<p></p>`. In order to make sure
      // this is treated as blank by the element's parse code and tagged as
      // invalid if allow-blank is not true, we explicitly set the value to an
      // empty string if the editor is blank. This is done using the `isBlank`
      // method, used by Quill to determine if the placeholder should be shown.
      // This is not a perfect solution, since it will not catch cases like
      // content with only a space or a bulleted list without text, but we're ok
      // with this caveat.
      //
      // An alternative solution would be to use the `getText` method, but this
      // would cause a false positive for elements that are part of the answer
      // but don't have a text (e.g., images).
      //
      // Because `isBlank` is undocumented, this solution may break in the
      // future (see https://github.com/slab/quill/issues/4254). To ensure that
      // the element continues to work if this method is removed, we use
      // optional chaining in the call. This would cause the empty check to
      // fail but not crash, so the element can continue working.
      const contents = quill.editor?.isBlank?.()
        ? ''
        : rtePurify.sanitize(quill.getSemanticHTML(), rtePurifyConfig);
      inputElement.val(
        btoa(
          he.encode(contents, {
            allowUnsafeSymbols: true, // HTML tags should be kept
            useNamedReferences: true,
          }),
        ),
      );

      // Update character/word count
      if (counter) {
        counter.update();
      }
    };

    quill.on('text-change', updateHiddenInput);
    updateHiddenInput();
  };

  // Override default implementation of 'formula'

  var Embed = Quill.import('blots/embed');

  class MathFormula extends Embed {
    static create(value) {
      const node = super.create(value);
      if (typeof value === 'string') {
        this.updateNode(node, value);
      }
      return node;
    }

    static updateNode(node, value) {
      MathJax.startup.promise.then(async () => {
        const html = await (MathJax.tex2chtmlPromise || MathJax.tex2svgPromise)(value);
        const formatted = html.innerHTML;
        // Without trailing whitespace, cursor will not appear at end of text if LaTeX is at end
        node.innerHTML = formatted + '&#8201;';
        node.contentEditable = 'false';
        node.setAttribute('data-value', value);
      });
    }

    static value(domNode) {
      return domNode.getAttribute('data-value');
    }
  }
  MathFormula.blotName = 'formula';
  MathFormula.className = 'ql-formula';
  MathFormula.tagName = 'SPAN';

  Quill.register('formats/formula', MathFormula, true);
})();
