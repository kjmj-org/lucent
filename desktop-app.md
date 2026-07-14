# Product Plan: Open-Source Amazon Image Optimizer

## 1. Product Overview

Build a free, open-source desktop application using Electron.js for Amazon sellers, designers, and e-commerce teams.

The app helps users prepare product listing images and A+ Content images before uploading them to Amazon.

Its purpose is not to become another general image editor or AI image generator. Its purpose is to solve a specific seller problem:

> An image may look sharp on the user’s computer, but appear softer, blurrier, or less professional after being uploaded to Amazon.

The application should help users understand why this happens, identify potential image-quality issues, and export a version better prepared for Amazon’s image-processing environment.

---

## 2. Background and User Need

More Amazon sellers are now creating images with tools such as ChatGPT, Midjourney, Flux, Canva, and other AI design products.

These tools make image creation easier, but the exported images are often not properly prepared for marketplace use.

Common problems include:

* The image has the correct pixel dimensions but still looks soft.
* Text and icons become blurry after upload.
* AI-generated textures lose detail after compression.
* Colors look different after upload.
* Large images are resized poorly by Amazon.
* The image has already been compressed before Amazon compresses it again.
* Sellers do not understand color profiles, resizing, sharpening, or export formats.
* Sellers do not know whether to use PNG or JPEG.
* Sellers cannot easily predict how an image may look after Amazon processes it.

Professional designers often solve these problems manually in Photoshop. Most sellers cannot.

They need a simple tool that turns a complicated image-preparation workflow into an easy process.

---

## 3. User Goal

The user should be able to:

1. Upload or drag an image into the app.
2. Select the type of Amazon image they are preparing.
3. See whether the image has potential quality problems.
4. Understand what may cause the image to become blurry.
5. Preview how the image may look after marketplace-style resizing or compression.
6. Apply recommended improvements.
7. Export an Amazon-ready version.
8. Process multiple images together.

The ideal experience should feel like:

> Upload, check, optimize, export.

The user should not need Photoshop knowledge or image-processing expertise.

---

## 4. Product Positioning

Do not position the product as a generic:

* AI image enhancer
* Photo upscaler
* Sharpening tool
* Image compressor
* Photoshop replacement

Those markets are already crowded.

Position it as:

> A free Amazon listing and A+ image preparation tool.

Suggested descriptions:

> Prepare listing and A+ images before uploading them to Amazon.

> Find image-quality problems before Amazon makes them visible.

> Optimize image size, sharpness, color, format, and compression for Amazon listings.

The Amazon-specific positioning is the main competitive advantage.

---

## 5. More Valuable Product Direction

The app should not only optimize images.

A more valuable direction is to make it an **Amazon Image Scoring and Diagnostic Tool**.

Users often do not know what is wrong with an image. Simply giving them an “Optimize” button does not build trust or help them learn.

The application should analyze the uploaded image and provide a preparation score.

Example:

### Amazon Image Preparation Score

**82/100**

* Dimensions: Good
* Aspect ratio: Good
* Sharpness: Needs improvement
* Color profile: Should be converted
* Compression: Source may already be heavily compressed
* Text clarity: Small text may become difficult to read
* Output format: PNG may be more suitable
* Upscaling risk: Low

The score must be presented as the application’s own estimate, not an official Amazon score.

This changes the product from a simple image converter into something closer to:

* PageSpeed Insights for Amazon images
* GTmetrix for listing graphics
* An image health check for Amazon sellers

This is easier for users to understand and gives the product more long-term value.

---

## 6. Core Product Features

### 6.1 Image analysis

The app should review the image and identify possible problems such as:

* Incorrect dimensions
* Incorrect aspect ratio
* Image too small
* Image much larger than necessary
* Possible quality loss from upscaling
* Soft or low-detail image
* Existing JPEG compression artifacts
* Unsuitable color profile
* Transparency problems
* Inappropriate file format
* Text or icons that may become blurry
* AI-generated details that may not survive compression well

The app should explain each issue in simple language.

---

### 6.2 Preparation score

Give each image an overall score and separate category scores.

Suggested categories:

* Size and dimensions
* Aspect ratio
* Sharpness
* Compression quality
* Color profile
* Text clarity
* Format suitability
* Upscaling risk

The score should answer:

> Is this image ready to upload?

---

### 6.3 One-click optimization

After analysis, the user should be able to apply recommended improvements.

Possible improvements include:

* Resize to the selected target
* Correct the aspect ratio
* Convert to sRGB
* Apply light output sharpening
* Choose a more suitable export format
* Remove unnecessary metadata
* Flatten transparency when necessary
* Export with appropriate image quality

The user should also be able to choose between:

* Conservative optimization
* Balanced optimization
* Strong optimization

Balanced should be the default.

---

### 6.4 Before-and-after preview

Show:

* Original image
* Optimized image
* Side-by-side or slider comparison
* 100% zoom
* Estimated marketplace compression preview

The preview should help the user inspect:

* Text
* Product edges
* Leaves and small textures
* Logos
* Icons
* Gradient backgrounds
* Lifestyle scenes

This is one of the most important features because it makes the problem visible.

---

### 6.5 Approximate Amazon processing preview

The app should provide an estimated preview of how the image may look after resizing and recompression.

It must clearly state:

> This is an approximation. Amazon’s actual image processing may differ.

The app should never claim to perfectly simulate Amazon.

---

### 6.6 Amazon image presets

The app should provide presets for common image use cases, such as:

* Main listing image
* Secondary listing image
* Square image
* Standard A+ image
* Wide A+ banner
* Comparison chart
* Four-image module
* Brand Story image
* Custom dimensions

Because Amazon may change its requirements, users should be able to edit or create presets.

The app should remind users to confirm the current dimensions shown in Seller Central.

---

### 6.7 Batch processing

Amazon sellers often prepare many images at once.

The app should allow users to:

* Import multiple images
* Apply one preset to all
* Apply the same optimization settings
* Review problems individually
* Export all images into one folder

---

## 7. User Experience

The app should remain simple.

### Main workflow

1. Drag images into the app.
2. Choose an Amazon image preset.
3. View the image score and warnings.
4. Select an optimization level.
5. Compare before and after.
6. Export the optimized version.

### Main screen

The screen should include:

* Image list
* Large preview
* Image score
* Problem summary
* Preset selector
* Optimization button
* Export button

Avoid making the interface look like Photoshop.

This is a preparation tool, not a full design editor.

---

## 8. Important Product Messages

The app should explain several important facts to users.

### Resolution is not the same as detail

Two images can have identical dimensions while having very different real image quality.

An AI-upscaled image may be large in pixels but still contain weak or artificial detail.

### Sharpening cannot recreate missing detail

Sharpening can improve perceived clarity, but it cannot restore real product texture that never existed.

### AI-generated text should be avoided

If text was generated inside an AI image, it may already be soft or distorted.

The best practice is still to add text separately in a design application.

### Amazon may process images again

Amazon may resize, recompress, convert, or crop uploaded images.

The app prepares images for this possibility but cannot guarantee identical final results.

---

## 9. Privacy and Open-Source Principles

The app should be local-first.

Core image processing should happen on the user’s computer.

The application should not require:

* An account
* A subscription
* Cloud storage
* Paid APIs
* Image uploads to an external server

Important product message:

> Your product images remain on your computer.

The project should be open source under a permissive license.

---

## 10. Target Users

Primary users:

* Amazon sellers
* Small brands
* Listing designers
* E-commerce agencies
* Virtual assistants
* Teams using AI-generated marketing images
* Sellers using Canva instead of Photoshop
* Sellers preparing A+ Content in-house

---

## 11. MVP Scope

The first version should include:

* Electron.js desktop app
* Local image import
* Common Amazon image presets
* Basic image analysis
* Preparation score
* Clear warnings and recommendations
* One-click optimization
* Resize and crop options
* sRGB conversion
* Light sharpening
* PNG and JPEG export
* Before-and-after preview
* Approximate compression preview
* Batch processing
* English and Simplified Chinese
* Windows support first

Do not include in the first version:

* AI image generation
* Background generation
* Product removal or replacement
* Photoshop-style layers
* Cloud accounts
* Billing
* Amazon SP-API integration
* Automatic publishing to Amazon
* Advanced generative editing

---

## 12. Future Opportunities

After the core product is stable, possible future features include:

* Detecting text that is too small
* Warning about AI-generated text
* Smart product-focused cropping
* Local AI upscaling
* Background removal
* Logo quality detection
* Comparison-chart readability checks
* Listing image compliance checks
* Community-created presets
* Profiles for Walmart, Shopify, Etsy, and eBay

The initial product should remain focused on solving Amazon image preparation problems well.

---

## 13. Success Criteria

The product is successful when a seller can take an image that may become blurry after upload and, without using Photoshop:

* Understand the likely problems
* See a meaningful image-quality score
* Preview potential quality loss
* Apply recommended improvements
* Export a better-prepared image
* Repeat the process for an entire listing

The app should make professional image preparation accessible to ordinary Amazon sellers.

---

## 14. Instruction to the AI Agent

Use this document as the product specification.

Make reasonable product and technical decisions independently.

Use Electron.js to build the desktop application.

Prioritize:

1. Simple user experience
2. Local processing and privacy
3. Useful image diagnostics
4. Clear explanations
5. Reliable optimization
6. Batch workflow
7. Maintainable open-source code

Do not overcomplicate the first version.

The most important product concept is:

> Diagnose first, explain the problem, then provide one-click optimization.

The preparation score, issue report, and estimated marketplace preview are as important as the actual image export.
