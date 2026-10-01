import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

// Direction 05 keeps the page in normal flow. Motion adds depth to the
// composed first frame; reading, product selection and browsing never wait.
export function createScrollChapters() {
  const media=gsap.matchMedia();
  const context=gsap.context(()=>{
    const hero=document.querySelector('.canvas-hero');
    if(!hero)return;
    const intro=gsap.timeline({defaults:{ease:'power3.out'}});
    intro.from('.canvas-arch',{y:16,opacity:.8,duration:1})
      .from('.canvas-title > span,.canvas-title > em',{y:18,opacity:.7,duration:.8,stagger:.1},.06)
      .from('.canvas-hero-copy,.canvas-ticket',{y:10,opacity:.8,duration:.8,stagger:.06},.15);
    document.querySelectorAll('.canvas-story-image').forEach(image=>{
      gsap.from(image,{y:24,duration:.9,ease:'power3.out',scrollTrigger:{trigger:image,start:'top 94%',once:true}});
    });
  });
  media.add('(min-width: 1000px) and (min-height: 650px)',()=>{
    const hero=document.querySelector('.canvas-hero');
    if(!hero)return;
    gsap.to('.canvas-shirt-depth',{y:-24,ease:'none',scrollTrigger:{trigger:hero,start:'top 100px',end:'bottom top',scrub:1,invalidateOnRefresh:true}});
    gsap.to('.canvas-ticket',{y:-12,ease:'none',scrollTrigger:{trigger:hero,start:'top 100px',end:'bottom top',scrub:1,invalidateOnRefresh:true}});
  });
  return()=>{media.revert();context.revert();};
}
