import { MAX_DISTANCE_THRESHOLD } from "../constants/index.js";
import Face from "../models/Face.js";
import Person from "../models/Person.js";

const euclideanDistance = (a, b) => {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
};

export const groupFaces = async () => {
  const allGroupedFaces = await Face.find({ personId: { $ne: null } });
  const ungroupedFaces = await Face.find({ personId: null });

  for (const face of ungroupedFaces) {
    const descriptor = face.descriptor;

    let matched = false;

    for (const groupedFace of allGroupedFaces) {
      const distance = euclideanDistance(descriptor, groupedFace.descriptor);
      if (distance < MAX_DISTANCE_THRESHOLD) {
        face.personId = groupedFace.personId;
        await face.save();
        matched = true;
        break;
      }
    }

    if (!matched) {
      const newPerson = new Person();
      await newPerson.save();
      face.personId = newPerson._id;
      await face.save();
      allGroupedFaces.push(face); // Now it's part of the grouped pool
    }
  }

  console.log("Finished grouping faces.");
};
