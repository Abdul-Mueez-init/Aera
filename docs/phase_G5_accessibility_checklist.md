# Phase G5 — Accessibility Checklist

## Overview

This checklist provides accessibility guidelines and verification points for the Aera Flutter application. Accessibility ensures that the app is usable by people with disabilities, including visual, motor, and cognitive impairments.

## WCAG 2.1 Level A/AA Compliance

### 1. Text and Visual Content

#### Color Contrast
- [ ] **Normal text (under 18pt)**: Minimum 4.5:1 contrast ratio
- [ ] **Large text (18pt+ or 14pt+ bold)**: Minimum 3:1 contrast ratio
- [ ] **UI components and graphical objects**: Minimum 3:1 contrast ratio
- [ ] **Text on images**: Ensure text remains readable when image is disabled

**Verification:**
- Use color contrast checker tools (e.g., WebAIM Contrast Checker)
- Test with grayscale mode to ensure information isn't conveyed only by color
- Verify error messages, status indicators work without color alone

#### Text Scaling
- [ ] **Support system font scaling**: Text should scale up to 200% without breaking layout
- [ ] **No hardcoded font sizes**: Use responsive text sizing (e.g., `Theme.of(context).textTheme`)
- [ ] **Line height**: Minimum 1.5 times font size for body text
- [ ] **Letter spacing**: Minimum 0.12 times font size for body text
- [ ] **Paragraph spacing**: Minimum 2 times font size

**Verification:**
- Test with Android "Font size" set to "Large" or "Largest"
- Test with iOS "Larger Accessibility Sizes"
- Verify text doesn't overflow or get cut off

#### Screen Reader Support
- [ ] **Semantic labels**: All interactive elements have semantic labels
- [ ] **Button labels**: Describe the action (e.g., "Submit" not just a checkmark)
- [ ] **Icon buttons**: Include tooltip or semantic label
- [ ] **State announcements**: Changes in state are announced (e.g., "Loading complete")
- [ ] **Focus order**: Logical focus order following visual layout

**Verification:**
- Test with TalkBack (Android) and VoiceOver (iOS)
- Navigate through the app using screen reader only
- Verify all interactive elements are announced correctly

### 2. Interactive Elements

#### Touch Targets
- [ ] **Minimum size**: 44x44 logical pixels for touch targets
- [ ] **Spacing**: Minimum 8px between touch targets
- [ ] **Clickable area**: Entire button/card is clickable, not just text/icon
- [ ] **Visual feedback**: Clear visual feedback on tap/hover

**Verification:**
- Measure touch target sizes in Flutter Inspector
- Test with various screen sizes and orientations
- Verify touch targets don't overlap

#### Keyboard Navigation
- [ ] **Tab order**: Logical tab order following visual layout
- [ ] **Focus indicators**: Clear focus indicator on all interactive elements
- [ ] **Keyboard shortcuts**: Support standard shortcuts where applicable
- [ ] **Escape key**: Escape should cancel/close modals/dialogs

**Verification:**
- Test with external keyboard on Android/iOS
- Verify focus moves logically through the interface
- Ensure focus indicators are clearly visible

#### Gesture Alternatives
- [ ] **Gesture alternatives**: Provide button alternatives for gestures
- [ ] **Swipe actions**: Provide alternative (e.g., button) for swipe actions
- [ ] **Drag and drop**: Provide alternative method for drag operations
- [ ] **Multi-touch**: Ensure single-touch alternatives exist

**Verification:**
- Test without using gestures (tap-only)
- Verify all features accessible with single tap
- Ensure no critical features require complex gestures

### 3. Content Structure

#### Headings and Landmarks
- [ ] **Heading hierarchy**: Proper heading levels (H1, H2, H3...)
- [ ] **Landmarks**: Use semantic widgets (e.g., `Semantics(label: 'Main content')`)
- [ ] **Grouping**: Related content grouped together
- [ ] **Lists**: Use list widgets for list content

**Verification:**
- Review screen reader output for proper structure
- Verify headings are announced correctly
- Ensure landmarks help navigation

#### Forms and Inputs
- [ ] **Labels**: All form fields have visible labels
- [ ] **Required fields**: Clearly marked as required
- [ ] **Error messages**: Associated with the field causing the error
- [ ] **Instructions**: Provide clear instructions for complex inputs
- [ ] **Validation**: Real-time validation with clear error messages

**Verification:**
- Test form navigation with screen reader
- Verify error messages are announced
- Ensure validation doesn't block submission without explanation

#### Images and Media
- [ ] **Alt text**: All images have descriptive alt text
- [ ] **Decorative images**: Marked as decorative (not announced)
- [ ] **Complex images**: Provide detailed descriptions for charts/graphs
- [ ] **Video**: Provide captions and transcripts
- [ ] **Audio**: Provide transcripts

**Verification:**
- Test with screen reader to verify image descriptions
- Verify decorative images are not announced
- Check that important information isn't only in images

### 4. Navigation and Orientation

#### Orientation
- [ ] **Landscape support**: App works in both portrait and landscape
- [ ] **Lock orientation**: Don't lock orientation unless necessary
- [ ] **Responsive layout**: Layout adapts to orientation changes
- [ ] **Content preservation**: Content preserved on orientation change

**Verification:**
- Test in both portrait and landscape modes
- Rotate device during app usage
- Verify content doesn't get lost or repositioned unexpectedly

#### Navigation
- [ ] **Back button**: Android back button works as expected
- [ ] **Navigation consistency**: Navigation patterns are consistent
- [ ] **Breadcrumbs**: Provide breadcrumbs for deep navigation
- [ ] **Skip links**: Provide way to skip repetitive content

**Verification:**
- Test back button behavior throughout the app
- Verify navigation is predictable
- Ensure users can navigate without getting lost

### 5. Timing and Motion

#### Time Limits
- [ ] **No time limits**: Avoid arbitrary time limits
- [ ] **Warning before timeout**: Provide warning before session timeout
- [ ] **Extend time**: Allow users to extend time limits
- [ ] **Pause controls**: Provide pause/stop for auto-playing content

**Verification:**
- Test session timeout behavior
- Verify warnings are clear and accessible
- Ensure users can complete tasks without rushing

#### Motion and Animation
- [ ] **Reduced motion**: Respect "Reduce Motion" system setting
- [ ] **No flashing**: Avoid content that flashes more than 3 times per second
- [ ] **Animation controls**: Provide way to pause/disable animations
- [ ] **Parallax effects**: Respect user preferences for motion

**Verification:**
- Enable "Reduce Motion" in system settings
- Verify animations are reduced or disabled
- Test with motion-sensitive users in mind

### 6. Error Prevention and Recovery

#### Error Prevention
- [ ] **Input validation**: Validate input before submission
- [ ] **Confirmation**: Confirm destructive actions
- [ ] **Reversible actions**: Make actions reversible where possible
- [ ] **Clear instructions**: Provide clear instructions for complex tasks

**Verification:**
- Test form validation
- Verify confirmation dialogs are accessible
- Ensure error states are clearly communicated

#### Error Recovery
- [ ] **Error messages**: Clear, specific error messages
- [ ] **Error location**: Indicate where the error occurred
- [ ] **Recovery steps**: Provide clear steps to fix the error
- [ ] **Retry mechanism**: Provide way to retry failed operations

**Verification:**
- Trigger various error conditions
- Verify error messages are announced by screen reader
- Ensure recovery steps are actionable

## Flutter-Specific Implementation

### Semantics Widget Usage
```dart
// Good: Proper semantic labels
Semantics(
  label: 'Submit form',
  button: true,
  child: ElevatedButton(
    onPressed: () => submitForm(),
    child: Text('Submit'),
  ),
)

// Good: Grouping related content
Semantics(
  label: 'Customer information',
  container: true,
  child: Column(
    children: [
      TextField(label: 'Name'),
      TextField(label: 'Email'),
    ],
  ),
)

// Good: Excluding decorative elements
Semantics(
  excludeSemantics: true,
  child: Icon(Icons.star),
)
```

### Focus Management
```dart
// Good: Focus management
FocusScope(
  autofocus: true,
  child: TextField(
    focusNode: _focusNode,
    onSubmitted: (value) {
      _focusNode.unfocus();
      // Move to next field
    },
  ),
)

// Good: Focus trap in dialogs
FocusScope(
  onKey: (node, event) {
    if (event.logicalKey == LogicalKeyboardKey.escape) {
      Navigator.pop(context);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  },
  child: AlertDialog(...),
)
```

### Accessible Widgets
```dart
// Good: Use built-in accessible widgets
TextField(
  decoration: InputDecoration(
    labelText: 'Email',
    hintText: 'Enter your email address',
    errorText: _errorText,
  ),
)

// Good: Switch with semantic label
Semantics(
  label: 'Enable notifications',
  value: _notificationsEnabled,
  onTap: () => setState(() => _notificationsEnabled = !_notificationsEnabled),
  child: Switch(
    value: _notificationsEnabled,
    onChanged: (value) => setState(() => _notificationsEnabled = value),
  ),
)
```

## Testing Checklist

### Automated Testing
- [ ] **Flutter analyzer**: Run `flutter analyze` and fix warnings
- [ ] **Accessibility rules**: Use `flutter test` with accessibility checks
- [ ] **Golden tests**: Visual regression tests for layout consistency
- [ ] **Integration tests**: Test navigation and user flows

### Manual Testing
- [ ] **Screen reader testing**: Test with TalkBack and VoiceOver
- [ ] **Keyboard navigation**: Test with external keyboard
- [ ] **Color blindness**: Test with color blindness simulators
- [ ] **Reduced motion**: Test with reduced motion enabled
- [ ] **Large text**: Test with large text settings

### User Testing
- [ ] **Users with disabilities**: Test with actual users with disabilities
- [ ] **Assistive technology**: Test with various assistive technologies
- [ ] **Different devices**: Test on various devices and screen sizes
- [ ] **Different ages**: Test with users of different age groups

## Priority Items

### High Priority (Must Fix)
1. Touch target sizes (minimum 44x44)
2. Color contrast ratios (4.5:1 for normal text)
3. Screen reader labels for all interactive elements
4. Keyboard navigation support
5. Error prevention and clear error messages

### Medium Priority (Should Fix)
1. Text scaling support
2. Orientation support
3. Reduced motion support
4. Form validation and labeling
5. Focus indicators

### Low Priority (Nice to Have)
1. Advanced screen reader announcements
2. Custom accessibility actions
3. Gesture alternatives for all gestures
4. Multi-language accessibility
5. Accessibility help documentation

## Tools and Resources

### Flutter Tools
- **Flutter Inspector**: Analyze widget tree and accessibility properties
- **Flutter DevTools**: Performance and accessibility debugging
- **accessibility_actions**: Flutter package for custom accessibility actions

### Testing Tools
- **TalkBack (Android)**: Built-in screen reader
- **VoiceOver (iOS)**: Built-in screen reader
- **WebAIM Contrast Checker**: Color contrast validation
- **axe DevTools**: Web accessibility testing (for web builds)

### Documentation
- **WCAG 2.1 Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **Flutter Accessibility**: https://flutter.dev/docs/development/accessibility-and-integration/accessibility
- **Material Design Accessibility**: https://material.io/design/usability/accessibility.html

## Compliance Status

### Current Status
- **WCAG 2.1 Level A**: Partially compliant
- **WCAG 2.1 Level AA**: Partially compliant
- **Section 508**: Partially compliant

### Known Issues
1. Some touch targets may be below 44x44 minimum
2. Color contrast not yet verified for all UI elements
3. Screen reader labels may be missing for some custom widgets
4. Keyboard navigation not fully implemented
5. Reduced motion not yet supported

### Recommendations
1. Implement automated accessibility testing in CI/CD
2. Add accessibility checks to code review process
3. Create accessibility guidelines for developers
4. Regular accessibility audits with users with disabilities
5. Stay updated with Flutter accessibility improvements

## Conclusion

This checklist provides a comprehensive guide for implementing and verifying accessibility in the Aera Flutter application. Accessibility is an ongoing process that should be integrated into the development workflow from the beginning, not added as an afterthought.

Regular accessibility testing and user feedback are essential for maintaining and improving accessibility over time.

## Related Documentation

- **Phase H1:** Release hardening and polish
- **Design Document:** Design tokens and visual language
- **Architecture Document:** Flutter component structure
- **WCAG 2.1 Guidelines:** Web Content Accessibility Guidelines
