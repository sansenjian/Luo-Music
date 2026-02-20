import anime from 'animejs'

export function useAnimations() {
  function animateButton(element) {
    if (!element) return
    
    anime({
      targets: element,
      scale: [1, 0.9, 1.1, 1],
      duration: 300,
      easing: 'easeInOutQuad'
    })
  }

  function animateCover(element) {
    if (!element) return
    
    anime({
      targets: element,
      scale: [0.95, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutQuad'
    })
  }

  return {
    animateButton,
    animateCover
  }
}
