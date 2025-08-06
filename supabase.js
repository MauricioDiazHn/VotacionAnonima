// Configuración de Supabase y funciones para la aplicación de evaluación de catedráticos

// Configuración de Supabase usando variables de entorno con fallback
const SUPABASE_URL = 'https://onncrefefsvdmpxthxtw.supabase.co';
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;

// Inicializar cliente de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==== AUTENTICACIÓN ====

// Iniciar sesión con email y contraseña
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  await saveSessionToStorage(data.session);
  return data.user;
}

// Registrar nuevo usuario
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });
  
  if (error) throw error;
  if (data.session) await saveSessionToStorage(data.session);
  return data.user;
}

// Cerrar sesión
async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  sessionStorage.removeItem('supabase.auth.token');
  localStorage.removeItem('supabase.auth.token');
  return true;
}

// Obtener el usuario actual
async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user;
}

// Verificar si el usuario está autenticado
async function isAuthenticated() {
  const user = await getCurrentUser();
  return user !== null;
}

// Almacenar sesión para persistencia
async function saveSessionToStorage(session) {
  if (session) {
    localStorage.setItem('supabase.auth.token', JSON.stringify(session));
  }
}

// ==== MANEJO DE DATOS DE CATEDRÁTICOS ====

// Obtener todos los catedráticos
async function getProfessors() {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// Obtener un catedrático por ID
async function getProfessorById(id) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(*),
      comments(*)
    `)
    .eq('id', id)
    .single();
  
  if (error) throw error;
  
  // Recalcular el rating basado en las evaluaciones actuales
  if (data && data.ratings && data.ratings.length > 0) {
    const averageRating = data.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / data.ratings.length;
    data.rating = parseFloat(averageRating.toFixed(1));
  } else {
    data.rating = 0;
  }
  
  return data;
}

// Obtener los catedráticos mejor evaluados
async function getTopRatedProfessors(limit = 5) {
  // Obtener TODOS los profesores con sus ratings para recalcular correctamente
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings para cada profesor
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  // Filtrar solo los que tienen evaluaciones (rating > 0) y ordenar por rating actualizado
  const topRated = professorsWithUpdatedRatings
    .filter(prof => prof.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
    
  console.log('Top rated professors recalculados:', topRated.map(p => ({
    name: p.name,
    rating: p.rating,
    evaluationsCount: p.ratings?.length || 0
  })));
  
  return topRated;
}

// Buscar catedráticos por nombre
async function searchProfessors(query) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `)
    .ilike('name', `%${query}%`);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// ==== MANEJO DE EVALUACIONES ====

// Enviar una nueva evaluación
async function submitEvaluation(professorId, evaluation) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { dominio, metodologia, puntualidad, comments } = evaluation;
  
  // Calcular el rating promedio
  const averageRating = ((dominio + metodologia + puntualidad) / 3).toFixed(1);
  
  console.log('Enviando evaluación:', {
    professorId,
    dominio,
    metodologia, 
    puntualidad,
    averageRating,
    comments
  });
  
  // 1. Guardar la evaluación en la tabla 'ratings'
  const { data: ratingData, error: ratingError } = await supabaseClient
    .from('ratings')
    .insert({
      professor_id: professorId,
      user_id: user.id,
      dominio,
      metodologia,
      puntualidad,
      average: averageRating
    })
    .select();
    
  if (ratingError) {
    console.error('Error al guardar rating:', ratingError);
    throw ratingError;
  }
  
  console.log('Rating guardado exitosamente:', ratingData);
  
  // 2. Guardar el comentario si existe
  if (comments && comments.trim() !== '') {
    const { data: commentData, error: commentError } = await supabaseClient
      .from('comments')
      .insert({
        professor_id: professorId,
        user_id: user.id,
        text: comments,
        date: new Date().toISOString().split('T')[0]
      })
      .select();
      
    if (commentError) {
      console.error('Error al guardar comentario:', commentError);
      throw commentError;
    }
    
    console.log('Comentario guardado exitosamente:', commentData);
  }
  
  // 3. Actualizar el rating promedio del catedrático
  const newAverage = await updateProfessorRating(professorId);
  console.log('Rating del profesor actualizado:', newAverage);
  
  return true;
}

// Actualizar el rating promedio de un catedrático
async function updateProfessorRating(professorId) {
  // Obtener todas las evaluaciones del profesor
  const { data, error } = await supabaseClient
    .from('ratings')
    .select('average')
    .eq('professor_id', professorId);
    
  if (error) throw error;
  
  if (data && data.length > 0) {
    // Calcular el promedio
    const ratings = data.map(r => parseFloat(r.average));
    const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    
    // Actualizar el catedrático
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: parseFloat(averageRating.toFixed(1)) })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`Rating actualizado para profesor ${professorId}: ${averageRating.toFixed(1)}`);
    return averageRating;
  } else {
    // Si no hay evaluaciones, mantener rating en 0
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: 0 })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`No hay evaluaciones para profesor ${professorId}, rating mantenido en 0`);
    return 0;
  }
}

// Verificar si un usuario ya evaluó a un catedrático
async function hasUserEvaluatedProfessor(professorId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('ratings')
    .select('id')
    .eq('professor_id', professorId)
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (error) throw error;
  return data !== null;
}

// Obtener evaluaciones realizadas por el usuario actual con detalles del profesor
async function getUserEvaluations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('ratings')
    .select(`
      *,
      professors(id, name, courses, avatar, rating)
    `)
    .eq('user_id', user.id)
    .order('average', { ascending: false }); // Ordenar por rating descendente
    
  if (error) throw error;
  return data;
}

// Obtener comentarios realizados por el usuario actual
async function getUserComments() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(id, name, courses, avatar)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  return data;
}

// Obtener todos los comentarios de todos los usuarios con información del profesor
async function getAllCommentsWithProfessors() {
  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(
        id, 
        name, 
        courses, 
        avatar, 
        rating,
        ratings(dominio, metodologia, puntualidad, average)
      )
    `)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  
  // Agrupar por profesor y ordenar profesores por rating
  const professorComments = {};
  
  data.forEach(comment => {
    const profId = comment.professor_id;
    if (!professorComments[profId]) {
      professorComments[profId] = {
        professor: comment.professors,
        comments: []
      };
    }
    professorComments[profId].comments.push(comment);
  });
  
  // Convertir a array y ordenar por rating del profesor
  const result = Object.values(professorComments).sort((a, b) => 
    (b.professor.rating || 0) - (a.professor.rating || 0)
  );
  
  return result;
}

// Agregar un nuevo catedrático (función anónima)
async function addProfessor(name, course) {
  // Generar avatar aleatorio con las iniciales del nombre
  const initials = name.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase();
  const colors = ['818cf8', 'f472b6', '34d399', 'f97316', '0ea5e9', '8b5cf6', '10b981', 'ef4444', '22c55e', '3b82f6'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const avatar = `https://placehold.co/64x64/${randomColor}/ffffff?text=${initials}`;
  
  const { data, error } = await supabaseClient
    .from('professors')
    .insert({
      name: name.trim(),
      courses: [course.trim()],
      avatar: avatar,
      rating: 0
    })
    .select();
    
  if (error) throw error;
  return data[0];
}

// Obtener un profesor aleatorio que el usuario no haya evaluado
async function getRandomUnevaluatedProfessor() {
  const user = await getCurrentUser();
  if (!user) {
    // Si no está autenticado, devolver un profesor completamente aleatorio
    const allProfessors = await getProfessors();
    if (allProfessors.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return allProfessors[randomIndex];
  }

  // Obtener todos los profesores
  const allProfessors = await getProfessors();
  
  // Obtener las evaluaciones del usuario
  const { data: userRatings, error } = await supabaseClient
    .from('ratings')
    .select('professor_id')
    .eq('user_id', user.id);
    
  if (error) throw error;
  
  const evaluatedIds = userRatings.map(rating => rating.professor_id);
  
  // Filtrar profesores no evaluados
  const unevaluatedProfessors = allProfessors.filter(prof => 
    !evaluatedIds.includes(prof.id)
  );
  
  console.log('Profesores disponibles:', allProfessors.length);
  console.log('Profesores ya evaluados:', evaluatedIds.length);
  console.log('Profesores sin evaluar:', unevaluatedProfessors.length);
  
  if (unevaluatedProfessors.length > 0) {
    // Hay profesores sin evaluar, devolver uno aleatorio
    const randomIndex = Math.floor(Math.random() * unevaluatedProfessors.length);
    return {
      professor: unevaluatedProfessors[randomIndex],
      canEvaluate: true,
      message: 'Evalúa a este catedrático'
    };
  } else {
    // Ya evaluó a todos, devolver uno aleatorio para ver comentarios
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return {
      professor: allProfessors[randomIndex],
      canEvaluate: false,
      message: 'Ya has evaluado a todos los catedráticos. Aquí puedes ver los comentarios de:'
    };
  }
}

// Función para sincronizar todos los ratings en la base de datos
async function syncAllProfessorRatings() {
  console.log('Sincronizando todos los ratings de profesores...');
  
  // Obtener todos los profesores
  const { data: professors, error: profError } = await supabaseClient
    .from('professors')
    .select('id, name');
    
  if (profError) throw profError;
  
  const updatePromises = professors.map(async (prof) => {
    await updateProfessorRating(prof.id);
  });
  
  await Promise.all(updatePromises);
  console.log('Sincronización completada para todos los profesores');
}

// Exportar todas las funciones
export {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  isAuthenticated,
  getProfessors,
  getProfessorById,
  getTopRatedProfessors,
  searchProfessors,
  submitEvaluation,
  hasUserEvaluatedProfessor,
  getUserEvaluations,
  getUserComments,
  getAllCommentsWithProfessors,
  addProfessor,
  syncAllProfessorRatings,
  getRandomUnevaluatedProfessor
};
