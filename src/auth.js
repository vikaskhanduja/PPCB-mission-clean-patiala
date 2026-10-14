import jwt from 'jsonwebtoken';
export function auth(req,res,next){
  const token=req.headers.authorization?.replace('Bearer ','');
  try { req.user=jwt.verify(token,process.env.JWT_SECRET||'development-secret-change-me'); next(); }
  catch { return res.status(401).json({message:'Unauthorized'}); }
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'});
