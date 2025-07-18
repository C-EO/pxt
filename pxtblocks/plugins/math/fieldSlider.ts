import * as Blockly from "blockly";

export class FieldSlider extends Blockly.FieldNumber {
    protected slider_: HTMLInputElement;
    protected readout_: HTMLSpanElement;
    protected step_: number;
    protected labelText_: string;
    private inputKeydownHandler: (e: KeyboardEvent) => {} | undefined;
    private sliderKeydownHandler: (e: KeyboardEvent) => {} | undefined;
    private sliderBlurHandler: (e: FocusEvent) => {} | undefined;
    private sliderPointerdownHandler: (e: PointerEvent) => {} | undefined;
    private keyboardControlActive = false;

    constructor(
        value?: string | number | typeof Blockly.Field.SKIP_SETUP,
        min?: string | number | null,
        max?: string | number | null,
        precision?: string | number | null,
        step?: string | number | null,
        labelText?: string | null,
        validator?: Blockly.FieldNumberValidator | null,
        config?: Blockly.FieldNumberConfig
    ) {
        super(value, min, max, precision, validator, config);

        if (typeof step === "string") {
            this.step_ = parseFloat(step);
        }
        else if (typeof step === "number") {
            this.step_ = step;
        }

        this.labelText_ = labelText;
    }

    hasMin() {
        return this.getMin() > -Infinity;
    }

    hasMax() {
        return this.getMax() < Infinity;
    }

    getStep() {
        return this.step_;
    }

    getLabel() {
        return this.labelText_;
    }

    setLabel(text: string) {
        this.labelText_ = text;
    }

    setOptions(min: number | string, max: number | string, step: string, precision: number | string) {
        this.setConstraints(min, max, precision);

        this.step_ = parseFloat(step) || undefined;
    }

    getFieldDescription(): string {
        return this.getValue() + "";
    }

    // Mostly the same as FieldNumber, but doesn't constrain min and max
    protected override doClassValidation_(newValue?: any): number {
        if (newValue === null) {
            return null;
        }

        // Clean up text.
        newValue = `${newValue}`;
        // TODO: Handle cases like 'ten', '1.203,14', etc.
        // 'O' is sometimes mistaken for '0' by inexperienced users.
        newValue = newValue.replace(/O/gi, '0');
        // Strip out thousands separators.
        newValue = newValue.replace(/,/g, '');
        // Ignore case of 'Infinity'.
        newValue = newValue.replace(/infinity/i, 'Infinity');

        // Clean up number.
        let n = Number(newValue || 0);
        if (isNaN(n)) {
            // Invalid number.
            return null;
        }

        // We allow values outside of the range with sliders in pxt
        // n = Math.min(Math.max(n, this.min_), this.max_);

        // Round to nearest multiple of precision.
        if (this.precision_ && isFinite(n)) {
            n = Math.round(n / this.precision_) * this.precision_;
        }

        let precisionString = String(this.precision_);
        if (precisionString.indexOf('e') !== -1) {
            // String() is fast.  But it turns .0000001 into '1e-7'.
            // Use the much slower toLocaleString to access all the digits.
            precisionString = this.precision_.toLocaleString('en-US', {
                maximumFractionDigits: 20,
            });
        }
        const decimalIndex = precisionString.indexOf('.');
        let decimalPlaces: number;
        if (decimalIndex === -1) {
            // If the precision is 0 (float) allow any number of decimals,
            // otherwise allow none.
            decimalPlaces = this.precision_ ? 0 : null;
        } else {
            decimalPlaces = precisionString.length - decimalIndex - 1;
        }
        // Clean up floating point errors.
        if (decimalPlaces !== null) {
            n = Number(n.toFixed(decimalPlaces));
        }
        return n;
    }

    protected widgetDispose_(): void {
        this.removeEventListeners();
        super.widgetDispose_();
    }

    private addEventListeners() {
        this.inputKeydownHandler = this.inputKeydownListener.bind(this);
        this.htmlInput_.addEventListener("keydown", this.inputKeydownHandler);
        this.sliderKeydownHandler = this.sliderKeydownListener.bind(this);
        this.slider_.addEventListener('keydown', this.sliderKeydownHandler);
        this.sliderBlurHandler = this.sliderBlurListener.bind(this);
        this.slider_.addEventListener('blur', this.sliderBlurHandler);
        this.sliderPointerdownHandler = this.sliderPointerdownListener.bind(this);
        this.slider_.addEventListener("pointerdown", this.sliderPointerdownHandler);
    }

    private removeEventListeners() {
        this.htmlInput_.removeEventListener("keydown", this.inputKeydownHandler);
        this.slider_.removeEventListener('keydown', this.sliderKeydownHandler);
        this.slider_.removeEventListener('blur', this.sliderBlurHandler);
        this.slider_.removeEventListener('pointerdown', this.sliderPointerdownHandler);
    }

    private inputKeydownListener(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            this.keyboardControlActive = true;
            this.slider_.focus();
        }
    }

    private sliderPointerdownListener(e: PointerEvent) {
        this.keyboardControlActive = false;
    }

    private sliderKeydownListener(e: KeyboardEvent) {
        switch(e.key) {
            case 'ArrowUp': {
                e.preventDefault();
                this.htmlInput_.focus();
                break;
            }
            case 'Enter':
            case ' ': {
                e.preventDefault();
                e.stopPropagation();
                Blockly.hideChaff();
                break;
            }
        }
    }

    private sliderBlurListener(e: FocusEvent) {
        this.keyboardControlActive = false;
    }

    protected showEditor_(_e?: Event, quietInput?: boolean): void {
        // Align with Blockly's approach in https://github.com/google/blockly-samples/blob/master/plugins/field-slider/src/field_slider.ts
        // Always quiet the input for the super constructor, as we don't want to
        // focus on the text field, and we don't want to display the modal
        // editor on mobile devices.
        super.showEditor_(_e, true);

        Blockly.DropDownDiv.hideWithoutAnimation();
        Blockly.DropDownDiv.clearContent();
        Blockly.DropDownDiv.getContentDiv().style.height = "";

        const contentDiv = Blockly.DropDownDiv.getContentDiv();

        // Accessibility properties
        contentDiv.setAttribute('role', 'menu');
        contentDiv.setAttribute('aria-haspopup', 'true');

        this.addSlider_(contentDiv);

        // Set colour and size of drop-down
        Blockly.DropDownDiv.setColour('#ffffff', '#dddddd');
        Blockly.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_ as Blockly.BlockSvg, undefined, undefined, false);

        this.addEventListeners();

        if (!quietInput) {
            this.htmlInput_.focus();
        }
    }

    protected addSlider_(contentDiv: Element) {
        if (this.labelText_) {
            let elements = this.createLabelDom_(this.labelText_);
            contentDiv.appendChild(elements[0]);
            this.readout_ = elements[1];
            this.setReadout(this.value_);
        }
        this.slider_ = this.createSlider();
        contentDiv.appendChild(this.slider_);

        const focus = () => {
            // In firefox, stealing focus from the range input interrupts
            // the dragging of the slider
            if (!pxt.BrowserUtils.isFirefox()) {
                if (!this.keyboardControlActive) {
                    this.htmlInput_.focus();
                }
            }
        };

        // Configure event handler.
        Blockly.browserEvents.bind(this.slider_, "input", this, (event: InputEvent) => {
            const val = parseFloat(this.slider_.value) || 0;
            if (val !== null) {
                this.setValue(val);
                const htmlInput = this.htmlInput_;
                if (htmlInput) { // pxt-blockly
                    htmlInput.value = val + "";
                    focus();
                }
            }
        });

        Blockly.browserEvents.bind(this.slider_, "focus", this, (event: FocusEvent) => {
            focus();
        });
    }

    setValue(newValue: any, fireChangeEvent?: boolean): void {
        super.setValue(newValue, fireChangeEvent);
        this.updateDom();
        if (this.slider_) {
            this.slider_.value = this.getValue() + "";
        }
    }

    protected createSlider() {
        const slider = document.createElement("input");
        slider.setAttribute('class', 'blocklyFieldSlider');
        slider.type = "range";
        slider.min = this.getMin() + "";
        slider.max = this.getMax() + "";
        slider.value = this.getValue() + "";

        let color: string;

        if (this.sourceBlock_ instanceof Blockly.BlockSvg) {
            // If the block color is white, grab from the parent block instead
            if (this.sourceBlock_.getColour() === "#ffffff") {
                if (this.sourceBlock_.getParent()) {
                    color = this.sourceBlock_.getParent().getColourTertiary();
                }
            }
            else {
                color = this.sourceBlock_.getColourTertiary();
            }
        }

        if (color) {
            slider.setAttribute("style", `--blocklyFieldSliderBackgroundColor: ${color}`);
        }

        if (!Number.isNaN(this.step_)) {
            slider.step = this.step_ + "";
        }
        return slider;
    }

    protected updateDom() {
        this.setReadout(this.getValue());
    }

    protected setReadout(value: string | number) {
        if (this.readout_) {
            this.readout_.innerText = value + "";
        }
    }

    protected createLabelDom_(labelText: string): [HTMLDivElement, HTMLSpanElement] {
        const labelContainer = document.createElement('div');
        labelContainer.setAttribute('class', 'blocklyFieldSliderLabel');
        const readout = document.createElement('span');
        readout.setAttribute('class', 'blocklyFieldSliderReadout');
        const label = document.createElement('span');
        label.setAttribute('class', 'blocklyFieldSliderLabelText');
        label.innerText = labelText;
        labelContainer.appendChild(label);
        labelContainer.appendChild(readout);
        return [labelContainer, readout];
    }
}

Blockly.fieldRegistry.register('field_slider', FieldSlider);

Blockly.Css.register(`
:root {
    --blocklyFieldSliderBackgroundColor: #547AB2;
}
.blocklyFieldSliderLabel {
    font-family: "Helvetica Neue", "Segoe UI", Helvetica, sans-serif;
    font-size: 0.65rem;
    color: $colour_toolboxText;
    margin: 8px;
}
.blocklyFieldSliderLabelText {
    font-weight: bold;
}
.blocklyFieldSliderReadout {
    margin-left: 10px;
}

input[type=range].blocklyFieldSlider {
    -webkit-appearance: none;
    width: 100%;
}
input[type=range].blocklyFieldSlider:focus {
    outline: none;
}
input[type=range].blocklyFieldSlider::-webkit-slider-runnable-track {
    -webkit-appearance: none;
    margin: 8px;
    height: 22px;
    width: 150px;
    outline: none;
    border-radius: 11px;
    margin-bottom: 20px;
    background: var(--blocklyFieldSliderBackgroundColor);
}
input[type=range].blocklyFieldSlider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 26px;
    height: 26px;
    margin-top: -1px;
    background-color: white;
    border-radius: 100%;
    -webkit-box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    -moz-box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    cursor: pointer;
}
input[type=range].blocklyFieldSlider:focus-visible::-webkit-slider-thumb {
    outline: 2px solid white; 
    outline-offset: 3px;
    -webkit-box-shadow: 0 0 0 3px var(--pxt-focus-border);
    -moz-box-shadow: 0 0 0 3px var(--pxt-focus-border);
    box-shadow: 0 0 0 3px var(--pxt-focus-border);
}
input[type=range].blocklyFieldSlider::-moz-range-track {
    margin: 8px;
    height: 22px;
    width: 95%;
    outline: none;
    border-radius: 11px;
    margin-bottom: 20px;
    background: #547AB2;
}
input[type=range].blocklyFieldSlider::-moz-range-thumb {
    width: 26px;
    height: 26px;
    margin-top: -1px;
    background-color: white;
    border-radius: 100%;
    -webkit-box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    -moz-box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15);
    cursor: pointer;
}
`)
